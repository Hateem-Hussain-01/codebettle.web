/**
 * Links page (Linktree-style) helpers — pure functions, unit-testable.
 *
 * The public /links page shows one centered card with the company logo,
 * contact details and full-width link buttons. It is NOT in the navbar,
 * footer, sitemap or robots — it is reached only by the direct link
 * Eman sends to clients.
 */

/** Production URL of the public Links page (never a localhost/dev URL). */
export const LINKS_PAGE_URL = 'https://codebettle-web.vercel.app/links';

/** One seed link: label, URL, icon key, display order. */
export interface DefaultLink {
  label: string;
  url: string;
  icon: string;
  order: number;
}

/**
 * The 6 seed links, in display order. All URLs are verified real:
 * site pages on the live Vercel URL, the WhatsApp number link and the
 * WhatsApp community invite. Seeded idempotently (SQL twin +
 * seedDefaultLinks) so the page works as soon as the SQL runs.
 */
export const DEFAULT_LINKS: readonly DefaultLink[] = [
  { label: 'Explore Our Courses', url: 'https://codebettle-web.vercel.app/courses', icon: 'courses', order: 0 },
  { label: 'Book a Call', url: 'https://codebettle-web.vercel.app/book-a-call', icon: 'call', order: 1 },
  { label: 'Our Success Stories', url: 'https://codebettle-web.vercel.app/success-stories', icon: 'stories', order: 2 },
  { label: 'Become a Campus Ambassador', url: 'https://codebettle-web.vercel.app/become-ambassador', icon: 'ambassador', order: 3 },
  { label: 'Chat on WhatsApp', url: 'https://wa.me/923055261893', icon: 'whatsapp', order: 4 },
  { label: 'Join Our WhatsApp Community', url: 'https://chat.whatsapp.com/GDclFx0AVxn2uxxAdwDVj2', icon: 'community', order: 5 },
];

/** Icon choices the admin can pick per link (key + human label). */
export const LINK_ICON_OPTIONS: readonly { key: string; label: string }[] = [
  { key: 'link', label: 'Link' },
  { key: 'courses', label: 'Courses (book)' },
  { key: 'call', label: 'Call (phone)' },
  { key: 'stories', label: 'Success stories (trophy)' },
  { key: 'ambassador', label: 'Ambassador (users)' },
  { key: 'whatsapp', label: 'WhatsApp (chat)' },
  { key: 'community', label: 'Community (group)' },
  { key: 'globe', label: 'Website (globe)' },
  { key: 'mail', label: 'Email (envelope)' },
  { key: 'video', label: 'Video (play)' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'star', label: 'Star' },
];

/** True when the icon key is one of the offered choices. */
export function isLinkIconKey(value: string): boolean {
  return LINK_ICON_OPTIONS.some((o) => o.key === value);
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/.test(value);
}

/**
 * Validate a link's label + URL (+ icon when given). Returns the error
 * message or null when valid. Same shape as validateNavItem
 * (lib/management.ts): a site path starting with / or a full http(s)
 * URL; labels are capped so a button never overflows the card.
 */
export function validateLink(input: { label: string; url: string; icon?: string }): string | null {
  if (!input.label.trim()) return 'Label is required';
  if (input.label.trim().length > 60) return 'Label must be 60 characters or fewer';
  const url = input.url.trim();
  if (!url) return 'Link URL is required';
  if (url.startsWith('/')) {
    if (url.includes(' ')) return 'Link path must not contain spaces';
  } else if (!isHttpUrl(url)) {
    return 'Link must be a site path (starting with /) or a full http(s) URL';
  }
  if (input.icon !== undefined && !isLinkIconKey(input.icon)) return 'Unknown icon — pick one from the list';
  return null;
}

/** The links to render on the public page: enabled rows in order. */
export function resolveLinks<T extends { enabled: boolean; order: number; createdAt: string }>(
  dbLinks: T[] | null | undefined,
): T[] {
  if (!dbLinks || dbLinks.length === 0) return [];
  return [...dbLinks]
    .filter((l) => l.enabled)
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}
