/**
 * Site settings service (Settings fix).
 *
 * The logic behind the Admin Settings page: General (site name +
 * description), Contact (email / phone / address), Maintenance
 * Mode, and the Success Stories texts (CEO message + vision, both
 * plain text, empty = the page shows its placeholder). Settings are
 * stored as key/value rows (SiteSetting model,
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
import { sanitizeEmailHtml } from '../sanitize';
import { isValidThumbnailUrl } from '../thumbnail';

export type SiteSettings = {
  siteName: string;
  siteDescription: string;
  contactEmail: string;
  phone: string;
  address: string;
  maintenanceMode: boolean;
  /**
   * Success Stories page: CEO message, RICH TEXT (HTML from the admin
   * RichTextEditor). Empty = show the page placeholder. Sanitized on
   * save (below) and again on render.
   */
  ceoMessage: string;
  /**
   * Success Stories page: CodeBettle vision, RICH TEXT (HTML). Empty =
   * show the page placeholder. Sanitized on save and again on render.
   */
  visionText: string;
  /**
   * Success Stories page: CEO photo URL (public Storage URL). Default
   * is Ahmad Hassan's photo, uploaded 13 Nov 2026 to the public
   * `course-images` bucket. Changed from Admin > Settings via the
   * "Update Image" button (upload first, then the URL is saved here).
   * Empty = fall back to the default photo below.
   */
  ceoPhotoUrl: string;
  /**
   * Success Stories page: video + vision layout (PR #32, managed from
   * Admin > Success Stories Management). videoUrl is the public video
   * URL ('' = no video yet, placeholder shown). videoLayout is
   * 'side-by-side' | 'vertical'; videoPosition is 'video-left' |
   * 'video-right' (side-by-side) or 'video-above' | 'video-below'
   * (vertical); videoOrientation is 'portrait' (9:16) | 'landscape'
   * (16:9). Invalid stored values fall back to the defaults (see
   * lib/management.ts parseVideoConfig).
   */
  videoUrl: string;
  videoLayout: string;
  videoPosition: string;
  videoOrientation: string;
  /**
   * Success Stories page: the three wide stat cards above the stories
   * grid (Eman's 13 Nov 2026 change). Defaults are the home page
   * numbers from components/sections/StatsSection.tsx; an admin can
   * edit them from the management tab.
   */
  statsActiveStudents: string;
  statsCertificatesIssued: string;
  statsAverageRating: string;
  /**
   * Navbar logo URL (PR #32, managed from Admin > Navbar Editor).
   * Default is the horizontal CodeBettle logo, resized for navbar use
   * and uploaded 13 Nov 2026 to the public `course-images` bucket
   * (brand/navbar-logo.png). Empty = fall back to the default below.
   */
  navbarLogoUrl: string;
};

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: 'CodeBettle',
  siteDescription:
    'CodeBettle is a premier digital institute offering expert-led courses in web development, mobile development, data science, UI/UX design, and more.',
  contactEmail: 'info@codebettle.com',
  phone: '+92 305 5261893',
  address: 'Lahore, Punjab, Pakistan',
  maintenanceMode: false,
  // Empty on purpose: the Success Stories page falls back to its
  // in-code placeholder text while no custom message is saved.
  ceoMessage: '',
  visionText: '',
  // Ahmad Hassan's photo, uploaded as-is 13 Nov 2026 to the PUBLIC
  // course-images bucket (verified live, byte-identical to the file
  // Eman sent). The public page shows this until an admin uploads a
  // new photo from Settings.
  ceoPhotoUrl:
    'https://phuzoxshzdfzjvephlhq.supabase.co/storage/v1/object/public/course-images/team/ahmad-hassan-ceo.png',
  // Video + vision: no video yet (placeholder until the admin uploads
  // one), current side-by-side portrait layout.
  videoUrl: '',
  videoLayout: 'side-by-side',
  videoPosition: 'video-left',
  videoOrientation: 'portrait',
  // Stat cards: the home page numbers (StatsSection.tsx).
  statsActiveStudents: '1500+',
  statsCertificatesIssued: '300+',
  statsAverageRating: '4.8',
  // Navbar logo: horizontal logo resized to 260x80 and uploaded
  // 13 Nov 2026 to the PUBLIC course-images bucket (verified live).
  navbarLogoUrl:
    'https://phuzoxshzdfzjvephlhq.supabase.co/storage/v1/object/public/course-images/brand/navbar-logo.png',
};

/** Storage key for each setting field. All values are strings. */
export const SETTING_KEYS: Record<keyof SiteSettings, string> = {
  siteName: 'site.name',
  siteDescription: 'site.description',
  contactEmail: 'contact.email',
  phone: 'contact.phone',
  address: 'contact.address',
  maintenanceMode: 'maintenance.enabled',
  ceoMessage: 'successStories.ceoMessage',
  visionText: 'successStories.visionText',
  ceoPhotoUrl: 'successStories.ceoPhotoUrl',
  videoUrl: 'successStories.videoUrl',
  videoLayout: 'successStories.videoLayout',
  videoPosition: 'successStories.videoPosition',
  videoOrientation: 'successStories.videoOrientation',
  statsActiveStudents: 'successStories.stats.activeStudents',
  statsCertificatesIssued: 'successStories.stats.certificatesIssued',
  statsAverageRating: 'successStories.stats.averageRating',
  navbarLogoUrl: 'navbar.logoUrl',
};

const STRING_FIELDS: Array<keyof SiteSettings> = [
  'siteName',
  'siteDescription',
  'contactEmail',
  'phone',
  'address',
  'ceoMessage',
  'visionText',
  'ceoPhotoUrl',
  'videoUrl',
  'videoLayout',
  'videoPosition',
  'videoOrientation',
  'statsActiveStudents',
  'statsCertificatesIssued',
  'statsAverageRating',
  'navbarLogoUrl',
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
 * Fields that hold RICH TEXT (HTML from the RichTextEditor). Saved
 * sanitized (same sanitizer the email builder uses) and rendered as
 * sanitized HTML on the public Success Stories page — never raw.
 */
const RICH_TEXT_FIELDS: Array<keyof SiteSettings> = ['ceoMessage', 'visionText'];

/** True when rich-text HTML carries no visible text (an editor left empty produces '<p><br></p>' etc.). */
function isBlankRichText(value: string): boolean {
  const text = value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, '')
    .trim();
  return text === '';
}

/** Clean a rich-text value for storage: blank editor HTML -> '', otherwise sanitized HTML. */
function cleanRichText(value: string): string {
  if (isBlankRichText(value)) return '';
  return sanitizeEmailHtml(value);
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
    if (typeof raw !== 'string') {
      throw new SettingsValidationError(`${field} must be a string`);
    }
    const value = raw.trim();
    // ceoPhotoUrl: a public image URL, or empty (falls back to the
    // default photo on read). Anything else is rejected — no
    // javascript:/data:/relative URLs, ever.
    if (field === 'ceoPhotoUrl') {
      if (!value) {
        cleaned.push({ field, stored: '' });
        continue;
      }
      if (!isValidThumbnailUrl(value)) {
        throw new SettingsValidationError('CEO photo must be a valid http(s) image URL');
      }
      cleaned.push({ field, stored: value });
      continue;
    }
    // navbarLogoUrl: same rule as the CEO photo (public image URL, or
    // empty = fall back to the default logo).
    if (field === 'navbarLogoUrl') {
      if (!value) {
        cleaned.push({ field, stored: '' });
        continue;
      }
      if (!isValidThumbnailUrl(value)) {
        throw new SettingsValidationError('Navbar logo must be a valid http(s) image URL');
      }
      cleaned.push({ field, stored: value });
      continue;
    }
    // videoUrl: a public video URL, or empty (no video yet — the page
    // shows its placeholder). Any http(s) URL is accepted (a video
    // is not an image, so the thumbnail check does not apply).
    if (field === 'videoUrl') {
      if (!value) {
        cleaned.push({ field, stored: '' });
        continue;
      }
      if (!/^https?:\/\/\S+$/.test(value)) {
        throw new SettingsValidationError('Video URL must be a valid http(s) URL');
      }
      cleaned.push({ field, stored: value });
      continue;
    }
    // Video layout enums: an invalid value is rejected here; a bad
    // stored value is still normalised on read (parseVideoConfig).
    if (field === 'videoLayout') {
      if (value !== 'side-by-side' && value !== 'vertical') {
        throw new SettingsValidationError('Video layout must be side-by-side or vertical');
      }
      cleaned.push({ field, stored: value });
      continue;
    }
    if (field === 'videoPosition') {
      if (!['video-left', 'video-right', 'video-above', 'video-below'].includes(value)) {
        throw new SettingsValidationError('Video position must be video-left, video-right, video-above or video-below');
      }
      cleaned.push({ field, stored: value });
      continue;
    }
    if (field === 'videoOrientation') {
      if (value !== 'portrait' && value !== 'landscape') {
        throw new SettingsValidationError('Video orientation must be portrait or landscape');
      }
      cleaned.push({ field, stored: value });
      continue;
    }
    // ceoMessage / visionText are RICH TEXT: sanitize on save (same
    // sanitizer the email builder uses) and normalize a blank editor
    // ('<p><br></p>') to '' — empty means "no custom text stored" and
    // the Success Stories page shows its placeholder. Every other
    // string field must stay non-empty.
    if (RICH_TEXT_FIELDS.includes(field)) {
      cleaned.push({ field, stored: cleanRichText(value) });
      continue;
    }
    if (!value) {
      throw new SettingsValidationError(`${field} must not be empty`);
    }
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
    // Default is '' for both text fields: the Success Stories page
    // treats an empty value as "no custom text" and shows its
    // placeholder. The photo default is the uploaded CEO photo URL.
    ceoMessage: pickString('ceoMessage'),
    visionText: pickString('visionText'),
    ceoPhotoUrl: pickString('ceoPhotoUrl'),
    // Video URL default is '' (no video yet — the page shows its
    // placeholder); the other video fields and the stats fall back to
    // their defaults when a row is missing or blank.
    videoUrl: byKey.get(SETTING_KEYS.videoUrl) ?? '',
    videoLayout: pickString('videoLayout'),
    videoPosition: pickString('videoPosition'),
    videoOrientation: pickString('videoOrientation'),
    statsActiveStudents: pickString('statsActiveStudents'),
    statsCertificatesIssued: pickString('statsCertificatesIssued'),
    statsAverageRating: pickString('statsAverageRating'),
    navbarLogoUrl: pickString('navbarLogoUrl'),
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
