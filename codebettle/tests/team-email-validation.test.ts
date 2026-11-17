/**
 * Team email validation regression (17 Nov 2026) — the email regex in
 * `lib/db/team.ts` was `/^[^s@]+@[^s@]+\.[^s@]+$/`: the class `[^s@]`
 * excluded the LETTER `s`, not whitespace (it was meant to be
 * `[^\s@]`). Any email containing an `s` — including Eman's own
 * `mhateemhussain1412@gmail.com` — failed team-grant and task
 * validation, so he could not be granted team access at all. Every
 * existing fixture email was `s`-free, which is why the bug slipped
 * through. These tests pin the fix through the real functions, against
 * the fake DB.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  createTeamTask,
  grantTeamAccess,
  updateTeamTask,
} from '../lib/db/team';

const D = (s: string) => new Date(s);

const ADMIN_ID = 'admin-1';

let fake: FakeDb;

function reset() {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: ADMIN_ID, name: 'Admin', email: 'admin@codebettle.com', passwordHash: 'x', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'member-s', name: 'Hateem', email: 'mhateemhussain1412@gmail.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'member-susan', name: 'Susan', email: 'susan@example.com', passwordHash: 'x', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
  ]);
}

test.beforeEach(() => reset());
test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

test("grant: an email containing 's' is accepted (Eman's own address)", async () => {
  const grant = await grantTeamAccess({ email: 'mhateemhussain1412@gmail.com', grantedBy: ADMIN_ID });
  assert.equal(grant.email, 'mhateemhussain1412@gmail.com');
  // The grant links to the account that already exists with the email.
  assert.equal(grant.userId, 'member-s');
});

test("grant: a plain email containing 's' is accepted", async () => {
  const grant = await grantTeamAccess({ email: 'susan@example.com', grantedBy: ADMIN_ID });
  assert.equal(grant.email, 'susan@example.com');
  assert.equal(grant.userId, 'member-susan');
});

test('grant: genuinely invalid emails still fail', async () => {
  for (const bad of ['not-an-email', 'a@b', 'has space@example.com', 'missing-dot@com', '@example.com']) {
    await assert.rejects(
      grantTeamAccess({ email: bad, grantedBy: ADMIN_ID }),
      /Valid email required/,
    );
  }
});

test("task create: an assignee email containing 's' is accepted", async () => {
  const task = await createTeamTask({
    title: 'Prepare the onboarding doc',
    assigneeEmail: 'susan@example.com',
    createdBy: ADMIN_ID,
  });
  assert.equal(task.assigneeEmail, 'susan@example.com');
});

test('task create: an invalid assignee email still fails', async () => {
  await assert.rejects(
    createTeamTask({ title: 'x', assigneeEmail: 'not-an-email', createdBy: ADMIN_ID }),
    /Valid assignee email required/,
  );
});

test("task update: reassigning to an email containing 's' is accepted", async () => {
  const task = await createTeamTask({
    title: 'Prepare the onboarding doc',
    assigneeEmail: 'susan@example.com',
    createdBy: ADMIN_ID,
  });
  const updated = await updateTeamTask(task.id, { assigneeEmail: 'mhateemhussain1412@gmail.com' });
  assert.equal(updated?.assigneeEmail, 'mhateemhussain1412@gmail.com');
});
