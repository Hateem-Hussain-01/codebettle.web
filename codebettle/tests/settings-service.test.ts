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

// ---------------------------------------------------------------------------
// Success Stories texts (CEO message + vision): plain text, empty allowed
// ---------------------------------------------------------------------------

test('success stories texts: defaults are empty (page shows its placeholder)', async () => {
  const settings = await getSiteSettings();
  assert.equal(settings.ceoMessage, '');
  assert.equal(settings.visionText, '');
  assert.equal(DEFAULT_SETTINGS.ceoMessage, '');
  assert.equal(DEFAULT_SETTINGS.visionText, '');
});

test('success stories texts: save + read back as HTML, formatting kept', async () => {
  const saved = await updateSiteSettings({
    ceoMessage: '<p>First paragraph with <strong>bold</strong>.</p><p>Second paragraph.</p>',
    visionText: '<p>Line one.</p><ul><li>Point one</li></ul>',
  });
  assert.equal(saved.ceoMessage, '<p>First paragraph with <strong>bold</strong>.</p><p>Second paragraph.</p>');
  assert.equal(saved.visionText, '<p>Line one.</p><ul><li>Point one</li></ul>');
  // Stored under their own keys, not colliding with other settings.
  const rows = await listSiteSettings();
  assert.equal(rows.find((r) => r.key === 'successStories.ceoMessage')?.value, '<p>First paragraph with <strong>bold</strong>.</p><p>Second paragraph.</p>');
  assert.equal(rows.find((r) => r.key === 'successStories.visionText')?.value, '<p>Line one.</p><ul><li>Point one</li></ul>');
  assert.deepEqual(await getSiteSettings(), saved);
});

test('success stories texts: dangerous HTML is stripped on save, never stored raw', async () => {
  const saved = await updateSiteSettings({
    ceoMessage: '<script>alert(1)</script><p onclick="evil()">Safe</p><img src="https://evil.example/x.png">',
    visionText: '<p>Keep <a href="javascript:alert(1)">this text</a>, drop the scheme.</p>',
  });
  assert.equal(saved.ceoMessage.includes('<script'), false);
  assert.equal(saved.ceoMessage.includes('onclick'), false);
  assert.equal(saved.ceoMessage.includes('evil.example'), false);
  assert.equal(saved.ceoMessage.includes('<p>Safe</p>'), true);
  assert.equal(saved.visionText.includes('javascript:'), false);
  assert.equal(saved.visionText.includes('Keep'), true);
});

test('success stories texts: blank editor HTML normalizes to empty (placeholder fallback)', async () => {
  await updateSiteSettings({ ceoMessage: '<p>Custom message</p>', visionText: '<p>Custom vision</p>' });
  const cleared = await updateSiteSettings({ ceoMessage: '<p><br></p>', visionText: '<p>&nbsp;</p>' });
  assert.equal(cleared.ceoMessage, '');
  assert.equal(cleared.visionText, '');
  // Other fields are untouched by the clear.
  assert.equal(cleared.siteName, DEFAULT_SETTINGS.siteName);
});

test('success stories texts: empty is allowed ONLY for these two fields', async () => {
  for (const bad of [{ siteName: '' }, { siteDescription: '   ' }, { phone: '' }]) {
    await assert.rejects(
      updateSiteSettings(bad as never),
      (err: unknown) => err instanceof SettingsValidationError,
    );
  }
  // …while an empty ceoMessage/visionText passes validation.
  const saved = await updateSiteSettings({ ceoMessage: '', visionText: '' });
  assert.equal(saved.ceoMessage, '');
  assert.equal(saved.visionText, '');
});

// ---------------------------------------------------------------------------
// CEO photo URL setting
// ---------------------------------------------------------------------------

test('ceo photo: default is Ahmad Hassan\'s uploaded photo', async () => {
  const settings = await getSiteSettings();
  assert.equal(
    settings.ceoPhotoUrl,
    'https://phuzoxshzdfzjvephlhq.supabase.co/storage/v1/object/public/course-images/team/ahmad-hassan-ceo.png',
  );
  assert.equal(DEFAULT_SETTINGS.ceoPhotoUrl, settings.ceoPhotoUrl);
});

test('ceo photo: save a new URL and read it back', async () => {
  const url = 'https://phuzoxshzdfzjvephlhq.supabase.co/storage/v1/object/public/course-images/team/ceo/abc-123.jpg';
  const saved = await updateSiteSettings({ ceoPhotoUrl: url });
  assert.equal(saved.ceoPhotoUrl, url);
  const rows = await listSiteSettings();
  assert.equal(rows.find((r) => r.key === 'successStories.ceoPhotoUrl')?.value, url);
  assert.deepEqual(await getSiteSettings(), saved);
});

test('ceo photo: non-URL values are rejected, nothing written', async () => {
  for (const bad of [
    'not-a-url',
    'ftp://example.com/photo.png',
    'javascript:alert(1)',
    'data:image/png;base64,abc',
    '/team/ceo/photo.png',
  ]) {
    await assert.rejects(
      updateSiteSettings({ ceoPhotoUrl: bad }),
      (err: unknown) => err instanceof SettingsValidationError && /valid http\(s\) image URL/.test(err.message),
    );
  }
  assert.deepEqual(await getSiteSettings(), DEFAULT_SETTINGS);
  assert.deepEqual(await listSiteSettings(), []);
});

test('ceo photo: clearing it falls back to the default photo on read', async () => {
  const url = 'https://example.com/new-ceo.jpg';
  await updateSiteSettings({ ceoPhotoUrl: url });
  const cleared = await updateSiteSettings({ ceoPhotoUrl: '' });
  assert.equal(cleared.ceoPhotoUrl, DEFAULT_SETTINGS.ceoPhotoUrl);
});
