/**
 * Site settings service (Settings fix).
 *
 * The logic behind the Admin Settings page: General (site name +
 * description), Contact (email / phone / address) and Maintenance
 * Mode. Settings are stored as key/value rows (SiteSetting model,
 * lib/db/settings.ts); NO seed rows exist — the defaults below are
 * the source of truth and the service falls back to them whenever a
 * row is missing.
 *
 * FAIL-SAFE (the whole point of this fix): getSiteSettings() and
 * isMaintenanceMode() NEVER throw. Every DB call is wrapped in
 * try/catch; on ANY error — the table does not exist yet because Eman
 * has not run the migration, the connection fails, a stored value is
 * unusable — they return DEFAULT_SETTINGS / false. The site keeps
 * working (with the hardcoded values it always had) until the
 * migration runs and an admin saves real values.
 *
 * updateSiteSettings() is the opposite: it DOES surface errors and
 * never pretends a failed save succeeded. It throws:
 * - SettingsValidationError (below) for invalid input — callers map
 *   this to HTTP 400. Validation runs BEFORE any write, so a bad
 *   patch writes nothing (no partial state).
 * - any DB error, rethrown as-is — callers map this to HTTP 500.
 * It returns the full settings as stored after the write (re-read
 * from the DB), never the patch echoed back.
 *
 * Authorisation lives with the caller (the admin route guard +
 * requireAdminArea('settings')): this service takes no Actor and
 * performs no auth check of its own.
 */
import { listSiteSettings, upsertSiteSetting } from '../db/settings';

export type SiteSettings = {
  siteName: string;
  siteDescription: string;
  contactEmail: string;
  phone: string;
  address: string;
  maintenanceMode: boolean;
};

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: 'CodeBettle',
  siteDescription:
    'CodeBettle is a premier digital institute offering expert-led courses in web development, mobile development, data science, UI/UX design, and more.',
  contactEmail: 'info@codebettle.com',
  phone: '+92 305 5261893',
  address: 'Lahore, Punjab, Pakistan',
  maintenanceMode: false,
};

/** Storage key for each setting field. All values are strings. */
export const SETTING_KEYS: Record<keyof SiteSettings, string> = {
  siteName: 'site.name',
  siteDescription: 'site.description',
  contactEmail: 'contact.email',
  phone: 'contact.phone',
  address: 'contact.address',
  maintenanceMode: 'maintenance.enabled',
};

const STRING_FIELDS: Array<keyof SiteSettings> = [
  'siteName',
  'siteDescription',
  'contactEmail',
  'phone',
  'address',
];

/** Thrown by updateSiteSettings() for invalid input (HTTP 400). */
export class SettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsValidationError';
  }
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Validate a patch before anything is written. Returns the cleaned
 * field -> storage-string entries to persist. Throws
 * SettingsValidationError on the first problem; writes nothing.
 */
function validatePatch(patch: Partial<SiteSettings>): Array<{ field: keyof SiteSettings; stored: string }> {
  const entries = Object.entries(patch) as Array<[keyof SiteSettings, unknown]>;
  if (entries.length === 0) {
    throw new SettingsValidationError('No settings provided');
  }
  const cleaned: Array<{ field: keyof SiteSettings; stored: string }> = [];
  for (const [field, raw] of entries) {
    if (field === 'maintenanceMode') {
      if (typeof raw !== 'boolean') {
        throw new SettingsValidationError('Maintenance mode must be true or false');
      }
      cleaned.push({ field, stored: raw ? 'true' : 'false' });
      continue;
    }
    if (!STRING_FIELDS.includes(field)) {
      throw new SettingsValidationError(`Unknown setting: ${String(field)}`);
    }
    if (typeof raw !== 'string' || !raw.trim()) {
      throw new SettingsValidationError(`${field} must not be empty`);
    }
    const value = raw.trim();
    if (field === 'contactEmail' && !isEmailLike(value)) {
      throw new SettingsValidationError('Contact email must be a valid email address');
    }
    cleaned.push({ field, stored: value });
  }
  return cleaned;
}

function rowsToSettings(rows: Array<{ key: string; value: string }>): SiteSettings {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const pickString = (field: keyof SiteSettings): string => {
    const stored = byKey.get(SETTING_KEYS[field]);
    // A missing row — or a stored blank — falls back to the default
    // for that field, so one corrupt row never breaks the whole page.
    return stored !== undefined && stored.trim() !== '' ? stored : DEFAULT_SETTINGS[field] as string;
  };
  return {
    siteName: pickString('siteName'),
    siteDescription: pickString('siteDescription'),
    contactEmail: pickString('contactEmail'),
    phone: pickString('phone'),
    address: pickString('address'),
    maintenanceMode: byKey.get(SETTING_KEYS.maintenanceMode) === 'true',
  };
}

/**
 * Current settings. NEVER throws: on any DB error (table missing,
 * connection failure) returns DEFAULT_SETTINGS.
 */
export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    return rowsToSettings(await listSiteSettings());
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Apply a partial update and return the full stored settings.
 * Validates the whole patch first (no partial writes on bad input).
 * THROWS SettingsValidationError on invalid input and rethrows any
 * DB error — a failed save is never reported as a success.
 */
export async function updateSiteSettings(patch: Partial<SiteSettings>): Promise<SiteSettings> {
  const cleaned = validatePatch(patch);
  for (const { field, stored } of cleaned) {
    await upsertSiteSetting(SETTING_KEYS[field], stored);
  }
  // Re-read from the DB so the caller gets what is actually stored.
  // (getSiteSettings never throws, but after successful writes the
  // read-back is the stored state; fall back to the patch merge only
  // if the read itself somehow fails.)
  const stored = await getSiteSettings();
  return stored;
}

/**
 * Whether maintenance mode is on. NEVER throws: false on any error
 * (fail-open for the public site — a broken settings read must not
 * take the whole site down).
 */
export async function isMaintenanceMode(): Promise<boolean> {
  try {
    const settings = await getSiteSettings();
    return settings.maintenanceMode;
  } catch {
    return false;
  }
}
