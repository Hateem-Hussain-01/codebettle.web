import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient, type DbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { GET as settingsGet, PATCH as settingsPatch } from '../app/api/admin/settings/route';
import { GET as publicGet } from '../app/api/settings/public/route';
import { DEFAULT_SETTINGS } from '../lib/services/settings-service';
import type { SessionUser } from '../lib/services/auth-service';

/**
 * Settings fix (API layer) — GET/PATCH /api/admin/settings and
 * GET /api/settings/public.
 *
 * Guards under test: requireAdminArea('settings') on the admin
 * routes (signed-out -> 401, non-admin -> 403), defaults when
 * nothing is stored, PATCH persisting and returning the updated
 * settings, invalid input rejected with 400 and nothing persisted,
 * and the public maintenance endpoint failing open to false.
 */

const ADMIN: SessionUser = {
  id: 'admin-1',
  name: 'Admin',
  email: 'admin@codebettle.com',
  role: 'admin',
  isAdmin: true,
};
const STUDENT: SessionUser = { id: 'student-1', name: 'Student', email: 's@example.com', role: 'student' };

let fake: FakeDb;

/** A client whose every query throws — simulates the table missing
 * (migration not run yet) or the database being unreachable. */
function throwingClient(): DbClient {
  const fail = (): never => {
    throw new Error('database unavailable');
  };
  const collection = new Proxy({}, { get: () => fail });
  const ormPublic = new Proxy({}, { get: () => collection });
  return { orm: { public: ormPublic } } as unknown as DbClient;
}

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

// ---------------------------------------------------------------------------
// GET /api/admin/settings — auth gate + defaults
// ---------------------------------------------------------------------------

test('settings API: signed-out user gets 401, student gets 403', async () => {
  __setTestSession(null);
  assert.equal(
    (await settingsGet()).status,
    401,
  );
  __setTestSession(STUDENT);
  assert.equal(
    (await settingsGet()).status,
    403,
  );
});

test('settings API: GET returns defaults when nothing is stored', async () => {
  __setTestSession(ADMIN);
  const res = await settingsGet();
  assert.equal(res.status, 200);
  const body = (await res.json()) as { settings: typeof DEFAULT_SETTINGS };
  assert.deepEqual(body.settings, DEFAULT_SETTINGS);
});

test('settings API: PATCH requires admin too', async () => {
  __setTestSession(null);
  assert.equal(
    (await settingsPatch(jsonReq('http://localhost/api/admin/settings', 'PATCH', { siteName: 'X' }))).status,
    401,
  );
  __setTestSession(STUDENT);
  assert.equal(
    (await settingsPatch(jsonReq('http://localhost/api/admin/settings', 'PATCH', { siteName: 'X' }))).status,
    403,
  );
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/settings — persist + validate
// ---------------------------------------------------------------------------

test('settings API: PATCH persists a change and returns the updated settings', async () => {
  __setTestSession(ADMIN);
  const res = await settingsPatch(
    jsonReq('http://localhost/api/admin/settings', 'PATCH', {
      siteName: 'New Name',
      maintenanceMode: true,
    }),
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { settings: typeof DEFAULT_SETTINGS };
  assert.equal(body.settings.siteName, 'New Name');
  assert.equal(body.settings.maintenanceMode, true);
  // Untouched fields keep their defaults.
  assert.equal(body.settings.contactEmail, DEFAULT_SETTINGS.contactEmail);
  assert.equal(body.settings.phone, DEFAULT_SETTINGS.phone);

  // A later GET reads back the persisted values.
  const reread = (await (
    await settingsGet()
  ).json()) as { settings: typeof DEFAULT_SETTINGS };
  assert.equal(reread.settings.siteName, 'New Name');
  assert.equal(reread.settings.maintenanceMode, true);
});

test('settings API: PATCH with a bad email returns 400 and persists nothing', async () => {
  __setTestSession(ADMIN);
  const res = await settingsPatch(
    jsonReq('http://localhost/api/admin/settings', 'PATCH', { contactEmail: 'not-an-email' }),
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /email/i);

  // Nothing was written — not even the valid fields of a mixed patch.
  const badMixed = await settingsPatch(
    jsonReq('http://localhost/api/admin/settings', 'PATCH', {
      siteName: 'Good Name',
      contactEmail: 'bad',
    }),
  );
  assert.equal(badMixed.status, 400);
  const reread = (await (
    await settingsGet()
  ).json()) as { settings: typeof DEFAULT_SETTINGS };
  assert.deepEqual(reread.settings, DEFAULT_SETTINGS);
});

test('settings API: PATCH with an empty body or blank value returns 400 and persists nothing', async () => {
  __setTestSession(ADMIN);
  assert.equal(
    (await settingsPatch(jsonReq('http://localhost/api/admin/settings', 'PATCH', {}))).status,
    400,
  );
  assert.equal(
    (await settingsPatch(jsonReq('http://localhost/api/admin/settings', 'PATCH', { siteName: '   ' }))).status,
    400,
  );
  const reread = (await (
    await settingsGet()
  ).json()) as { settings: typeof DEFAULT_SETTINGS };
  assert.deepEqual(reread.settings, DEFAULT_SETTINGS);
});

test('settings API: PATCH with an invalid body is 400', async () => {
  __setTestSession(ADMIN);
  const res = await settingsPatch(
    new NextRequest('http://localhost/api/admin/settings', {
      method: 'PATCH',
      body: '{not json',
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// GET /api/settings/public — no auth, fail-open
// ---------------------------------------------------------------------------

test('public settings: no auth needed, returns maintenanceMode false by default', async () => {
  __setTestSession(null);
  const res = await publicGet();
  assert.equal(res.status, 200);
  const body = (await res.json()) as { maintenanceMode: boolean };
  assert.deepEqual(body, { maintenanceMode: false });
});

test('public settings: reflects maintenance mode once an admin turns it on', async () => {
  __setTestSession(ADMIN);
  await settingsPatch(
    jsonReq('http://localhost/api/admin/settings', 'PATCH', { maintenanceMode: true }),
  );
  __setTestSession(null);
  const body = (await (await publicGet()).json()) as { maintenanceMode: boolean };
  assert.deepEqual(body, { maintenanceMode: true });
});

test('public settings: returns { maintenanceMode: false } when the service errors', async () => {
  __setDbClient(throwingClient());
  __setTestSession(null);
  const res = await publicGet();
  assert.equal(res.status, 200);
  const body = (await res.json()) as { maintenanceMode: boolean };
  assert.deepEqual(body, { maintenanceMode: false });
});
