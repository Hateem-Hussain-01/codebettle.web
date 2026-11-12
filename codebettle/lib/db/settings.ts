/**
 * Site settings repository (Settings fix).
 *
 * Key/value settings (SiteSetting model): one row per dotted key —
 * site.name, site.description, contact.email, contact.phone,
 * contact.address, maintenance.enabled. All values are strings
 * ('true' / 'false' for maintenance.enabled). No rows are seeded:
 * the defaults live in code (DEFAULT_SETTINGS in
 * lib/services/settings-service.ts) and the service falls back to them
 * whenever a row is missing — including before the migration has run.
 *
 * Follows lib/db/social-links.ts exactly: getDb() seam from
 * lib/db/client.ts, `getDb().orm.public.SiteSetting...`. Upsert is
 * update-then-create (no upsert in the fake DB, and no repository
 * uses one yet — see tests/fake-db.ts), so the same code runs against
 * the real client and the in-memory fake.
 */
import { getDb } from './client';

export interface SiteSettingEntry {
  key: string;
  value: string;
}

/** All stored settings, as key/value pairs. */
export async function listSiteSettings(): Promise<SiteSettingEntry[]> {
  const rows = await getDb().orm.public.SiteSetting.all();
  return rows.map((row) => ({ key: row.key, value: row.value }));
}

/** One stored setting by key. Null when no row exists. */
export async function getSiteSetting(key: string): Promise<SiteSettingEntry | null> {
  const row = await getDb().orm.public.SiteSetting.where({ key }).first();
  if (!row) return null;
  return { key: row.key, value: row.value };
}

/**
 * Create or replace the row for `key`. Returns the stored entry.
 * Update-then-create: when no row matches, update returns null and
 * we create instead.
 */
export async function upsertSiteSetting(key: string, value: string): Promise<SiteSettingEntry> {
  const updated = await getDb().orm.public.SiteSetting.where({ key }).update({ value });
  if (updated) return { key: updated.key, value: updated.value };
  const created = await getDb().orm.public.SiteSetting.create({ key, value });
  return { key: created.key, value: created.value };
}
