/**
 * Payment-account management service (Phase 1e, Module 16).
 *
 * The logic behind /api/admin/payment-accounts/*. No Next.js imports —
 * unit-testable with the fake db. Every mutation writes an audit entry.
 *
 * Authorisation is enforced here as well as in the route guard
 * (requireAdminArea('settings')): only admins hold the
 * `managePaymentAccounts` capability (lib/rbac.ts), so a non-admin can
 * never create, edit or delete an account even if a route guard were
 * bypassed. Payment-account data is RECEIVING-account info (account
 * numbers / holder names students pay into) — not secrets — but writes
 * are admin-only all the same.
 */
import {
  createPaymentAccount,
  deletePaymentAccount,
  getPaymentAccountById,
  listPaymentAccounts,
  updatePaymentAccount,
  type CreatePaymentAccountInput,
  type UpdatePaymentAccountInput,
} from '../db/payment-accounts';
import { logAudit } from '../db/audit';
import { can } from '../rbac';
import type { PaymentAccount } from '../db/types';
import { badRequest, forbidden, notFound, type Actor, type ServiceError } from './errors';

type Result<T> = T | ServiceError;

function requireManage(actor: Actor): ServiceError | null {
  if (!can(actor.role, 'managePaymentAccounts')) {
    return forbidden('Only admins can manage payment accounts');
  }
  return null;
}

type AccountRef = {
  accountNumber?: string | null;
  iban?: string | null;
  walletNumber?: string | null;
};

/** At least one receiving-account identifier must be present. */
function hasAccountRef(ref: AccountRef): boolean {
  return [ref.accountNumber, ref.iban, ref.walletNumber].some(
    (v) => (v ?? '').trim() !== '',
  );
}

export async function listPaymentAccountsService(
  actor: Actor,
): Promise<Result<{ accounts: PaymentAccount[] }>> {
  const err = requireManage(actor);
  if (err) return err;
  return { accounts: await listPaymentAccounts() };
}

export async function createPaymentAccountService(
  actor: Actor,
  input: CreatePaymentAccountInput,
): Promise<Result<{ account: PaymentAccount }>> {
  const err = requireManage(actor);
  if (err) return err;
  if (!input.label.trim()) return badRequest('Label is required');
  if (!input.accountHolder.trim()) return badRequest('Account holder is required');
  if (!hasAccountRef(input)) {
    return badRequest('Provide an account number, IBAN or wallet number');
  }
  const account = await createPaymentAccount({
    ...input,
    label: input.label.trim(),
    accountHolder: input.accountHolder.trim(),
  });
  await logAudit({
    actorId: actor.id,
    action: 'payment-account.create',
    entity: 'payment-account',
    entityId: account.id,
    detail: account.label,
  });
  return { account };
}

export async function updatePaymentAccountService(
  actor: Actor,
  id: string,
  input: UpdatePaymentAccountInput,
): Promise<Result<{ account: PaymentAccount }>> {
  const err = requireManage(actor);
  if (err) return err;
  const existing = await getPaymentAccountById(id);
  if (!existing) return notFound('Payment account');
  if (input.label !== undefined && !input.label.trim()) {
    return badRequest('Label is required');
  }
  if (input.accountHolder !== undefined && !input.accountHolder.trim()) {
    return badRequest('Account holder is required');
  }
  // The at-least-one rule applies to the merged record, so a PATCH that
  // only renames an account is fine, but clearing its last account
  // identifier is rejected.
  const merged: AccountRef = {
    accountNumber:
      input.accountNumber !== undefined ? input.accountNumber : existing.accountNumber,
    iban: input.iban !== undefined ? input.iban : existing.iban,
    walletNumber:
      input.walletNumber !== undefined ? input.walletNumber : existing.walletNumber,
  };
  if (!hasAccountRef(merged)) {
    return badRequest('Provide an account number, IBAN or wallet number');
  }
  const updated = await updatePaymentAccount(id, {
    ...input,
    ...(input.label !== undefined ? { label: input.label.trim() } : {}),
    ...(input.accountHolder !== undefined
      ? { accountHolder: input.accountHolder.trim() }
      : {}),
  });
  if (!updated) return notFound('Payment account');
  await logAudit({
    actorId: actor.id,
    action: 'payment-account.update',
    entity: 'payment-account',
    entityId: updated.id,
    detail: updated.label,
  });
  return { account: updated };
}

export async function deletePaymentAccountService(
  actor: Actor,
  id: string,
): Promise<Result<{ success: true }>> {
  const err = requireManage(actor);
  if (err) return err;
  const existing = await getPaymentAccountById(id);
  if (!existing) return notFound('Payment account');
  // History is safe: submissions keep a frozen accountSnapshot, so
  // deleting the account never rewrites a past submission.
  await deletePaymentAccount(id);
  await logAudit({
    actorId: actor.id,
    action: 'payment-account.delete',
    entity: 'payment-account',
    entityId: id,
    detail: existing.label,
  });
  return { success: true };
}
