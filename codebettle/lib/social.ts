/**
 * Shared social-links source (Phase 4, Module 7 — Footer).
 *
 * The ONE place the footer's and the auth navbar's social links live —
 * both components/layout/Footer.tsx and
 * components/auth/AuthSocialNav.tsx read from here, so the two can
 * never drift apart.
 *
 * Two layers:
 * 1. Hardcoded defaults below — the platforms CodeBettle actually
 *    uses, with the verified profile URLs. The footer renders these
 *    while the SocialLink table is empty (and before the Phase 4
 *    migration has run), so the site never shows dead links.
 * 2. Admin-managed rows (SocialLink model, /api/admin/social-links) —
 *    an admin adds/edits/deletes icons by Icon Name + Icon Link only;
 *    the icon is auto-fetched from the name (resolvePlatformKey).
 *    When at least one DB row exists, the footer shows ONLY the
 *    enabled rows (resolveFooterLinks) — the admin takes full control,
 *    including removing a default platform by deleting/disabling it.
 *
 * Decisions from the user (11 Nov 2026):
 * - Phone is +92 305 5261893 (the 305 number, already on the login
 *   page), NOT the 321 number. Email stays info@codebettle.com — the
 *   address already in the footer; no different email was invented.
 * - GitHub is https://github.com/Hateem-Hussain-01 (Eman's decision;
 *   no CodeBettle GitHub link existed on the site before — the only
 *   GitHub links in code were instructor-profile links).
 * - NO YouTube link (not theirs) and NO X/Twitter slot — neither is a
 *   known platform here and neither is in the defaults. If an admin
 *   types an unknown name (including X/Twitter), the row is stored
 *   but the footer renders it with a generic link icon, never with
 *   an X/Twitter brand mark.
 *
 * Pure functions only — no Next.js imports, unit-testable.
 */

/** Platforms the footer knows how to draw an icon for. */
export type SocialPlatformKey =
  | 'whatsapp'
  | 'facebook'
  | 'instagram'
  | 'linkedin'
  | 'github'
  | 'email'
  | 'unknown';

export interface SocialPlatform {
  key: Exclude<SocialPlatformKey, 'unknown'>;
  /** Display label, e.g. "LinkedIn". Also the Icon Name the admin types. */
  label: string;
  /** Verified profile URL (or mailto: for Email). */
  defaultUrl: string;
}

/** Verified CodeBettle profiles, in footer display order. */
export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    defaultUrl: 'https://wa.me/923055261893',
  },
  {
    key: 'facebook',
    label: 'Facebook',
    defaultUrl:
      'https://www.facebook.com/profile.php?id=61561458044925&mibextid=JRoKGi',
  },
  {
    key: 'instagram',
    label: 'Instagram',
    defaultUrl: 'https://www.instagram.com/codebettle?igsh=MWhxd3Vrd202ZTF6NA==',
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    defaultUrl: 'https://www.linkedin.com/company/codebettle/',
  },
  {
    key: 'github',
    label: 'GitHub',
    defaultUrl: 'https://github.com/Hateem-Hussain-01',
  },
  { key: 'email', label: 'Email', defaultUrl: 'mailto:info@codebettle.com' },
] as const;

/** Footer contact details (same values as the auth pages). */
export const CONTACT_EMAIL = 'info@codebettle.com';
export const CONTACT_PHONE = '+92 305 5261893';
export const CONTACT_PHONE_LINK = 'tel:+923055261893';
export const CONTACT_ADDRESS = 'Lahore, Punjab, Pakistan';

/**
 * The WhatsApp community-group invite. This is a SEPARATE entry from
 * the WhatsApp number icon — the auth navbar shows it as its own
 * "Join our community" pill. It is not a footer social icon.
 */
export const WHATSAPP_COMMUNITY_URL =
  'https://chat.whatsapp.com/GDclFx0AVxn2uxxAdwDVj2?mode=ac_t';

/** One resolved footer icon: what the footer actually renders. */
export interface ResolvedSocialLink {
  key: SocialPlatformKey;
  label: string;
  url: string;
}

/** The footer defaults: every known platform, in display order. */
export function defaultSocialLinks(): ResolvedSocialLink[] {
  return SOCIAL_PLATFORMS.map((p) => ({
    key: p.key,
    label: p.label,
    url: p.defaultUrl,
  }));
}

/** Aliases an admin might type for a platform name. */
const PLATFORM_ALIASES: Record<string, SocialPlatformKey> = {
  whatsapp: 'whatsapp',
  wa: 'whatsapp',
  facebook: 'facebook',
  fb: 'facebook',
  instagram: 'instagram',
  ig: 'instagram',
  linkedin: 'linkedin',
  github: 'github',
  gh: 'github',
  email: 'email',
  mail: 'email',
  'e-mail': 'email',
};

/**
 * Auto-fetch the icon for an admin-typed Icon Name: normalise the name
 * (lowercase, strip spaces/hyphens/underscores) and match a known
 * platform. Unknown names (including X/Twitter — deliberately not a
 * known platform) resolve to 'unknown' and render a generic icon.
 */
export function resolvePlatformKey(name: string): SocialPlatformKey {
  const normalized = name
    .toLowerCase()
    .replace(/[\s\-_]+/g, '')
    .trim();
  if (normalized === 'x' || normalized === 'twitter') return 'unknown';
  return PLATFORM_ALIASES[normalized] ?? 'unknown';
}

/** Display label for a platform key (unknown names keep their own name). */
export function platformLabel(key: SocialPlatformKey, fallbackName: string): string {
  if (key === 'unknown') return fallbackName;
  return SOCIAL_PLATFORMS.find((p) => p.key === key)?.label ?? fallbackName;
}

/** A row as stored in the SocialLink table (or received from the API). */
export interface SocialLinkEntry {
  name: string;
  url: string;
  displayOrder?: number;
  isEnabled?: boolean;
}

/**
 * Resolve what the footer shows.
 * - No DB rows (null/undefined/empty — e.g. before any admin entry, or
 *   before the migration has run): the hardcoded defaults.
 * - At least one row: ONLY the enabled rows, in displayOrder (then
 *   name) order. Disabled rows and rows with a blank URL are hidden —
 *   the footer never renders a dead link.
 */
export function resolveFooterLinks(
  rows: SocialLinkEntry[] | null | undefined,
): ResolvedSocialLink[] {
  if (!rows || rows.length === 0) return defaultSocialLinks();
  return rows
    .filter((r) => r.isEnabled !== false && r.url.trim() !== '' && r.name.trim() !== '')
    .map((r) => {
      const key = resolvePlatformKey(r.name);
      return {
        key,
        label: platformLabel(key, r.name.trim()),
        url: r.url.trim(),
        displayOrder: r.displayOrder ?? 0,
      };
    })
    .sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return a.label.localeCompare(b.label);
    })
    .map(({ key, label, url }) => ({ key, label, url }));
}

/**
 * Is this a URL the footer/admin may store? http(s) profile URLs and
 * mailto: addresses only — no javascript:, data: or relative URLs, so
 * a stored link can never become a script or a same-site trap.
 */
export function isValidSocialUrl(url: string): boolean {
  const value = url.trim();
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
