import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { GET as listAccounts, POST as createAccount } from '../app/api/admin/payment-accounts/route';
import { PATCH as updateAccount, DELETE as deleteAccount } from '../app/api/admin/payment-accounts/[id]/route';
import { listActivePaymentAccounts, listPaymentAccounts } from '../lib/db/payment-accounts';
import { getPaymentSubmissionById } from '../lib/db/payments';
import { getAuditLog } from '../lib/db/audit';
import type { SessionUser } from '../lib/services/auth-service';

/**
 * Phase 1e (Module 16) — admin Payment Accounts CRUD under Settings.
 * Routes are guarded by requireAdminArea('settings') and the service
 * enforces the managePaymentAccounts RBAC capability (admin-only).
 * Payment-account data is RECEIVING-account info (account numbers /
 * holder names students pay into), not secrets — but writes are
 * admin-only all the same.
 */

const D = (s: string) => new Date(s);
const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };
// Restricted admin: granted only the courses area, NOT settings.
const RESTRICTED_ADMIN: SessionUser = {
  id: 'admin-2', name: 'Restricted', email: 'restricted@codebettle.com', role: 'admin',
  adminPermissions: { courses: true },
};
const STUDENT: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };

let fake: FakeDb;

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const BANK_BODY = {
  label: 'HBL — Main',
  method: 'bank',
  accountHolder: 'CodeBettle',
  bankName: 'HBL',
  accountNumber: '12345678901234',
  instructions: 'Send the fee and share the transaction ID',
  displayOrder: 0,
};

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'admin-2', name: 'Restricted', email: 'restricted@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

test('admin CRUD: create (201) -> list -> PATCH edit -> DELETE, with audit entries', async () => {
  __setTestSession(ADMIN);

  const created = await createAccount(jsonReq('http://localhost/api/admin/payment-accounts', 'POST', BANK_BODY));
  assert.equal(created.status, 201);
  const createdBody = await created.json() as { account: { id: string; label: string; method: string } };
  assert.equal(createdBody.account.label, 'HBL — Main');
  assert.equal(createdBody.account.method, 'bank');

  const listed = await listAccounts();
  assert.equal(listed.status, 200);
  const listBody = await listed.json() as { accounts: { id: string }[] };
  assert.equal(listBody.accounts.length, 1);
  assert.equal(listBody.accounts[0].id, createdBody.account.id);

  const updated = await updateAccount(
    jsonReq(`http://localhost/api/admin/payment-accounts/${createdBody.account.id}`, 'PATCH', { label: 'HBL — Updated', displayOrder: 3 }),
    { params: Promise.resolve({ id: createdBody.account.id }) },
  );
  assert.equal(updated.status, 200);
  const updatedBody = await updated.json() as { account: { label: string; displayOrder: number } };
  assert.equal(updatedBody.account.label, 'HBL — Updated');
  assert.equal(updatedBody.account.displayOrder, 3);

  const audit = await getAuditLog();
  assert.ok(audit.some((e) => e.action === 'payment-account.create' && e.entityId === createdBody.account.id));
  assert.ok(audit.some((e) => e.action === 'payment-account.update' && e.entityId === createdBody.account.id));

  const deleted = await deleteAccount(
    new NextRequest(`http://localhost/api/admin/payment-accounts/${createdBody.account.id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id: createdBody.account.id }) },
  );
  assert.equal(deleted.status, 200);
  assert.equal((await listPaymentAccounts()).length, 0);
  assert.ok((await getAuditLog()).some((e) => e.action === 'payment-account.delete'));

  // Second delete is a 404, not a silent success.
  const deletedAgain = await deleteAccount(
    new NextRequest(`http://localhost/api/admin/payment-accounts/${createdBody.account.id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id: createdBody.account.id }) },
  );
  assert.equal(deletedAgain.status, 404);
});

test('deleting a payment account referenced by submissions succeeds and keeps the frozen snapshot', async () => {
  __setTestSession(ADMIN);
  const created = await createAccount(jsonReq('http://localhost/api/admin/payment-accounts', 'POST', BANK_BODY));
  assert.equal(created.status, 201);
  const { account } = await created.json() as { account: { id: string } };

  // Two submissions: one paid into this account, one into another account.
  const snapshot = {
    label: 'HBL — Main', method: 'bank', accountHolder: 'CodeBettle',
    bankName: 'HBL', accountNumber: '12345678901234',
  };
  fake.seed('PaymentSubmission', [
    {
      id: 'sub-1', enrollmentId: 'enr-1', paymentAccountId: account.id, method: 'bank',
      amountPkr: 5000, transactionRef: 'TXN-1', proofUrl: null, accountSnapshot: snapshot,
      reviewStatus: 'submitted', submittedAt: D('2024-02-01'), createdAt: D('2024-02-01'), updatedAt: D('2024-02-01'),
    },
    {
      id: 'sub-2', enrollmentId: 'enr-2', paymentAccountId: 'other-account', method: 'bank',
      amountPkr: 7000, transactionRef: 'TXN-2', proofUrl: null,
      accountSnapshot: { label: 'Other', method: 'bank', accountHolder: 'Someone' },
      reviewStatus: 'approved', submittedAt: D('2024-02-02'), createdAt: D('2024-02-02'), updatedAt: D('2024-02-02'),
    },
  ]);

  const deleted = await deleteAccount(
    new NextRequest(`http://localhost/api/admin/payment-accounts/${account.id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id: account.id }) },
  );
  assert.equal(deleted.status, 200);
  assert.equal((await listPaymentAccounts()).length, 0);

  // The referencing submission survives, detached, with its frozen
  // snapshot byte-for-byte intact — history is not rewritten.
  const kept = await getPaymentSubmissionById('sub-1');
  assert.ok(kept);
  assert.equal(kept.paymentAccountId, undefined);
  assert.deepEqual(kept.accountSnapshot, snapshot);
  assert.equal(kept.reviewStatus, 'submitted');
  assert.equal(kept.transactionRef, 'TXN-1');

  // The submission on the other account is untouched.
  const other = await getPaymentSubmissionById('sub-2');
  assert.ok(other);
  assert.equal(other.paymentAccountId, 'other-account');
});

test('non-admin gets 403 on every payment-accounts route', async () => {
  __setTestSession(STUDENT);
  assert.equal((await listAccounts()).status, 403);
  assert.equal((await createAccount(jsonReq('http://localhost/api/admin/payment-accounts', 'POST', BANK_BODY))).status, 403);
  assert.equal((await updateAccount(
    jsonReq('http://localhost/api/admin/payment-accounts/x', 'PATCH', { label: 'Nope' }),
    { params: Promise.resolve({ id: 'x' }) },
  )).status, 403);
  assert.equal((await deleteAccount(
    new NextRequest('http://localhost/api/admin/payment-accounts/x', { method: 'DELETE' }),
    { params: Promise.resolve({ id: 'x' }) },
  )).status, 403);
  assert.equal((await listPaymentAccounts()).length, 0);
});

test('delete requires the admin area guard: restricted admin without settings gets 403', async () => {
  __setTestSession(ADMIN);
  const created = await createAccount(jsonReq('http://localhost/api/admin/payment-accounts', 'POST', BANK_BODY));
  const { account } = await created.json() as { account: { id: string } };

  __setTestSession(RESTRICTED_ADMIN);
  assert.equal((await listAccounts()).status, 403);
  assert.equal((await deleteAccount(
    new NextRequest(`http://localhost/api/admin/payment-accounts/${account.id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id: account.id }) },
  )).status, 403);
  // The account is still there — the denied delete changed nothing.
  assert.equal((await listPaymentAccounts()).length, 1);
});

test('validation rejects a missing label, a missing holder, and a missing account number', async () => {
  __setTestSession(ADMIN);

  const noLabel = await createAccount(jsonReq('http://localhost/api/admin/payment-accounts', 'POST', {
    ...BANK_BODY, label: '',
  }));
  assert.equal(noLabel.status, 400);

  const noHolder = await createAccount(jsonReq('http://localhost/api/admin/payment-accounts', 'POST', {
    ...BANK_BODY, accountHolder: '   ',
  }));
  assert.equal(noHolder.status, 400);

  // No accountNumber / iban / walletNumber at all.
  const noRef = await createAccount(jsonReq('http://localhost/api/admin/payment-accounts', 'POST', {
    label: 'No ref', method: 'bank', accountHolder: 'CodeBettle', bankName: 'HBL',
  }));
  assert.equal(noRef.status, 400);

  // Invalid method.
  const badMethod = await createAccount(jsonReq('http://localhost/api/admin/payment-accounts', 'POST', {
    ...BANK_BODY, method: 'crypto',
  }));
  assert.equal(badMethod.status, 400);

  assert.equal((await listPaymentAccounts()).length, 0);
});

test('deactivate hides the account from the active list; PATCH isActive reactivates it', async () => {
  __setTestSession(ADMIN);
  const created = await createAccount(jsonReq('http://localhost/api/admin/payment-accounts', 'POST', {
    label: 'Easypaisa', method: 'easypaisa', accountHolder: 'CodeBettle', walletNumber: '03001234567',
  }));
  const { account } = await created.json() as { account: { id: string } };
  assert.equal((await listActivePaymentAccounts()).length, 1);

  const deactivated = await updateAccount(
    jsonReq(`http://localhost/api/admin/payment-accounts/${account.id}`, 'PATCH', { isActive: false }),
    { params: Promise.resolve({ id: account.id }) },
  );
  assert.equal(deactivated.status, 200);
  assert.deepEqual(await listActivePaymentAccounts(), []);
  // The admin list still shows it (inactive), so it can be reactivated.
  assert.equal((await listPaymentAccounts()).length, 1);

  const reactivated = await updateAccount(
    jsonReq(`http://localhost/api/admin/payment-accounts/${account.id}`, 'PATCH', { isActive: true }),
    { params: Promise.resolve({ id: account.id }) },
  );
  assert.equal(reactivated.status, 200);
  assert.equal((await listActivePaymentAccounts()).length, 1);
});

test('PATCH rejects clearing the last account identifier and PATCH on a missing account is 404', async () => {
  __setTestSession(ADMIN);
  const created = await createAccount(jsonReq('http://localhost/api/admin/payment-accounts', 'POST', BANK_BODY));
  const { account } = await created.json() as { account: { id: string } };

  const cleared = await updateAccount(
    jsonReq(`http://localhost/api/admin/payment-accounts/${account.id}`, 'PATCH', { accountNumber: '' }),
    { params: Promise.resolve({ id: account.id }) },
  );
  assert.equal(cleared.status, 400);
  assert.equal((await listPaymentAccounts())[0].accountNumber, '12345678901234');

  const missing = await updateAccount(
    jsonReq('http://localhost/api/admin/payment-accounts/nope', 'PATCH', { label: 'Ghost' }),
    { params: Promise.resolve({ id: 'nope' }) },
  );
  assert.equal(missing.status, 404);

  const emptyPatch = await updateAccount(
    jsonReq(`http://localhost/api/admin/payment-accounts/${account.id}`, 'PATCH', {}),
    { params: Promise.resolve({ id: account.id }) },
  );
  assert.equal(emptyPatch.status, 400);
});

test('list is ordered by displayOrder', async () => {
  __setTestSession(ADMIN);
  for (const [label, order] of [['C account', 2], ['A account', 0], ['B account', 1]] as const) {
    const res = await createAccount(jsonReq('http://localhost/api/admin/payment-accounts', 'POST', {
      label, method: 'bank', accountHolder: 'CodeBettle', accountNumber: `acc-${order}`, displayOrder: order,
    }));
    assert.equal(res.status, 201);
  }
  const listed = await listAccounts();
  const body = await listed.json() as { accounts: { label: string }[] };
  assert.deepEqual(body.accounts.map((a) => a.label), ['A account', 'B account', 'C account']);
});
