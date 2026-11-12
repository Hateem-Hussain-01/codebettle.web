import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient, type DbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { listSiteSettings, upsertSiteSetting } from '../lib/db/settings';
import {
  DEFAULT_SETTINGS,
  SettingsValidationError,
  getSiteSettings,
  isMaintenanceMode,
  updateSiteSettings,
} from '../lib/services/settings-service';

/**
 * Settings fix (data layer) — SiteSetting model + settings service.
 * Fail-safe reads (defaults when the table is empty OR the DB
 * throws), upsert round-trip, validation that writes nothing on bad
 * input, and errors surfaced (never swallowed) on save.
 */

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

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
});

test.afterEach(() => {
  __resetDbClient();
});

// ---------------------------------------------------------------------------
// Fail-safe reads: defaults when empty, defaults when the DB throws
// ---------------------------------------------------------------------------

test('defaults: empty table -> DEFAULT_SETTINGS, maintenance off', async () => {
  assert.deepEqual(await getSiteSettings(), DEFAULT_SETTINGS);
  assert.equal(await isMaintenanceMode(), false);
  assert.deepEqual(await listSiteSettings(), []);
});

test('fail-safe: DB throws -> defaults returned, maintenance false, no throw', async () => {
  __setDbClient(throwingClient());
  assert.deepEqual(await getSiteSettings(), DEFAULT_SETTINGS);
  assert.equal(await isMaintenanceMode(), false);
});

test('per-key fallback: a stored blank value falls back to its default', async () => {
  fake.seed('SiteSetting', [
    { key: 'site.name', value: '   ', updatedAt: new Date() },
    { key: 'maintenance.enabled', value: 'TRUE', updatedAt: new Date() },
  ]);
  const settings = await getSiteSettings();
  assert.equal(settings.siteName, DEFAULT_SETTINGS.siteName);
  // Only the exact string 'true' turns maintenance on.
  assert.equal(settings.maintenanceMode, false);
});

// ---------------------------------------------------------------------------
// Upsert round-trip (db layer + service)
// ---------------------------------------------------------------------------

test('upsert round-trip: save persists and reads back; second save updates the same row', async () => {
  const saved = await updateSiteSettings({ siteName: 'New Name', maintenanceMode: true });
  assert.equal(saved.siteName, 'New Name');
  assert.equal(saved.maintenanceMode, true);
  // Untouched fields keep their defaults.
  assert.equal(saved.contactEmail, DEFAULT_SETTINGS.contactEmail);
  assert.equal(saved.phone, DEFAULT_SETTINGS.phone);

  assert.deepEqual(await getSiteSettings(), saved);
  assert.equal(await isMaintenanceMode(), true);

  // Second save hits the update path, not create: still one row.
  const savedAgain = await updateSiteSettings({ siteName: 'Newer Name', maintenanceMode: false });
  assert.equal(savedAgain.siteName, 'Newer Name');
  assert.equal(savedAgain.maintenanceMode, false);
  assert.equal((await listSiteSettings()).length, 2);
  assert.equal(await isMaintenanceMode(), false);

  // Direct db-layer upsert: create then update the same key.
  await upsertSiteSetting('contact.email', 'hello@example.com');
  await upsertSiteSetting('contact.email', 'other@example.com');
  const rows = await listSiteSettings();
  assert.equal(rows.filter((r) => r.key === 'contact.email').length, 1);
  assert.equal(rows.find((r) => r.key === 'contact.email')?.value, 'other@example.com');
});

test('defaults object is not mutated by reads', async () => {
  const settings = await getSiteSettings();
  settings.siteName = 'Mutated';
  assert.equal(DEFAULT_SETTINGS.siteName, 'CodeBettle');
  assert.equal((await getSiteSettings()).siteName, 'CodeBettle');
});

// ---------------------------------------------------------------------------
// Validation: bad input rejected, nothing written
// ---------------------------------------------------------------------------

test('validation: bad email rejected with SettingsValidationError, nothing written', async () => {
  await assert.rejects(
    updateSiteSettings({ contactEmail: 'not-an-email' }),
    (err: unknown) => err instanceof SettingsValidationError && /valid email/.test(err.message),
  );
  await assert.rejects(
    updateSiteSettings({ contactEmail: '  ' }),
    (err: unknown) => err instanceof SettingsValidationError,
  );
  assert.deepEqual(await getSiteSettings(), DEFAULT_SETTINGS);
  assert.deepEqual(await listSiteSettings(), []);
});

test('validation: blank strings and non-boolean maintenance rejected, nothing written', async () => {
  for (const bad of [
    { siteName: '' },
    { siteName: '   ' },
    { siteDescription: '' },
    { phone: '' },
    { address: '   ' },
    { maintenanceMode: 'true' },
    { maintenanceMode: 1 },
  ]) {
    await assert.rejects(
      updateSiteSettings(bad as never),
      (err: unknown) => err instanceof SettingsValidationError,
    );
  }
  await assert.rejects(
    updateSiteSettings({}),
    (err: unknown) => err instanceof SettingsValidationError && /No settings/.test(err.message),
  );
  assert.deepEqual(await getSiteSettings(), DEFAULT_SETTINGS);
  assert.deepEqual(await listSiteSettings(), []);
});

test('validation: one bad field rejects the whole patch (no partial state)', async () => {
  await assert.rejects(
    updateSiteSettings({ siteName: 'Good Name', contactEmail: 'bad' }),
    (err: unknown) => err instanceof SettingsValidationError,
  );
  // Even the valid field was NOT written.
  assert.deepEqual(await getSiteSettings(), DEFAULT_SETTINGS);
  assert.deepEqual(await listSiteSettings(), []);
});

test('validation: values are trimmed before storing', async () => {
  const saved = await updateSiteSettings({
    siteName: '  Padded Name  ',
    contactEmail: '  admin@codebettle.com  ',
  });
  assert.equal(saved.siteName, 'Padded Name');
  assert.equal(saved.contactEmail, 'admin@codebettle.com');
});

// ---------------------------------------------------------------------------
// Save errors surface (never a fake success)
// ---------------------------------------------------------------------------

test('save failure: DB throws -> updateSiteSettings rejects, no fake success', async () => {
  __setDbClient(throwingClient());
  await assert.rejects(updateSiteSettings({ siteName: 'X' }), /database unavailable/);
});
