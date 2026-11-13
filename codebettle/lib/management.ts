/**
 * Success Stories Management — pure helpers (PR #32).
 *
 * No DB, no Next.js imports: unit-testable. Used by the public
 * /success-stories page, the home reviews carousel, the admin
 * management tab, the Reviews admin section and the Navbar Editor.
 */

// ---------------------------------------------------------------------------
// Video & Vision layout config (stored as SiteSetting keys, read through
// getSiteSettings(); see lib/services/settings-service.ts).
// ---------------------------------------------------------------------------

export type VideoLayout = 'side-by-side' | 'vertical';
export type VideoPosition = 'video-left' | 'video-right' | 'video-above' | 'video-below';
export type VideoOrientation = 'portrait' | 'landscape';

export interface VideoConfig {
  /** Public video URL, or '' when no video has been uploaded yet. */
  videoUrl: string;
  layout: VideoLayout;
  /** Side-by-side: which side the video is on. Vertical: above/below. */
  position: VideoPosition;
  orientation: VideoOrientation;
}

export const DEFAULT_VIDEO_CONFIG: VideoConfig = {
  videoUrl: '',
  layout: 'side-by-side',
  position: 'video-left',
  orientation: 'portrait',
};

export function isVideoLayout(value: unknown): value is VideoLayout {
  return value === 'side-by-side' || value === 'vertical';
}

export function isVideoPosition(value: unknown): value is VideoPosition {
  return (
    value === 'video-left' ||
    value === 'video-right' ||
    value === 'video-above' ||
    value === 'video-below'
  );
}

export function isVideoOrientation(value: unknown): value is VideoOrientation {
  return value === 'portrait' || value === 'landscape';
}

/**
 * Normalise a stored video config (unknown / partial / invalid values
 * fall back to the defaults, so a bad row can never break the public
 * page). The stored `position` is only meaningful for its layout:
 * a side-by-side layout with a vertical position (video-above) is
 * corrected to video-left, and vice versa.
 */
export function parseVideoConfig(
  input: {
    videoUrl?: unknown;
    layout?: unknown;
    position?: unknown;
    orientation?: unknown;
  } | null | undefined,
): VideoConfig {
  const layout = isVideoLayout(input?.layout) ? input.layout : DEFAULT_VIDEO_CONFIG.layout;
  let position = isVideoPosition(input?.position) ? input.position : DEFAULT_VIDEO_CONFIG.position;
  if (layout === 'side-by-side' && (position === 'video-above' || position === 'video-below')) {
    position = 'video-left';
  }
  if (layout === 'vertical' && (position === 'video-left' || position === 'video-right')) {
    position = 'video-above';
  }
  return {
    videoUrl: typeof input?.videoUrl === 'string' ? input.videoUrl.trim() : '',
    layout,
    position,
    orientation: isVideoOrientation(input?.orientation) ? input.orientation : DEFAULT_VIDEO_CONFIG.orientation,
  };
}

/** CSS aspect class for the video frame. */
export function videoAspectClass(orientation: VideoOrientation): string {
  return orientation === 'landscape' ? 'aspect-video' : 'aspect-[9/16]';
}

// ---------------------------------------------------------------------------
// Stats (small cards on /success-stories, after Team, before stories).
// Eman's stated numbers from his reference image are the defaults;
// an admin can edit them from the management tab (stored as settings).
// ---------------------------------------------------------------------------

export interface PageStats {
  happyStudents: string;
  averageRating: string;
  recommendRate: string;
  hoursOfLearning: string;
}

export const DEFAULT_PAGE_STATS: PageStats = {
  happyStudents: '1500+',
  averageRating: '4.9/5',
  recommendRate: '98%',
  hoursOfLearning: '5000+',
};

export const PAGE_STAT_LABELS: Record<keyof PageStats, string> = {
  happyStudents: 'Happy Students',
  averageRating: 'Average Rating',
  recommendRate: 'Recommend Us',
  hoursOfLearning: 'Hours of Learning',
};

/** Normalise stored stats: a blank stored value falls back to its default. */
export function parsePageStats(
  input: { happyStudents?: unknown; averageRating?: unknown; recommendRate?: unknown; hoursOfLearning?: unknown } | null | undefined,
): PageStats {
  const pick = (key: keyof PageStats): string => {
    const value = input?.[key];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : DEFAULT_PAGE_STATS[key];
  };
  return {
    happyStudents: pick('happyStudents'),
    averageRating: pick('averageRating'),
    recommendRate: pick('recommendRate'),
    hoursOfLearning: pick('hoursOfLearning'),
  };
}

// ---------------------------------------------------------------------------
// Team grouping (public page): enabled members only, grouped by level
// top-to-bottom, cards ordered within each level.
// ---------------------------------------------------------------------------

export interface TeamMemberLike {
  id: string;
  level: number;
  orderInLevel: number;
  enabled: boolean;
}

export interface TeamLevelGroup<T extends TeamMemberLike> {
  level: number;
  members: T[];
}

export function groupTeamByLevel<T extends TeamMemberLike>(members: T[]): TeamLevelGroup<T>[] {
  const enabled = members.filter((m) => m.enabled);
  const byLevel = new Map<number, T[]>();
  for (const m of enabled) {
    const list = byLevel.get(m.level) ?? [];
    list.push(m);
    byLevel.set(m.level, list);
  }
  return [...byLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, list]) => ({
      level,
      members: [...list].sort(
        (a, b) => a.orderInLevel - b.orderInLevel || a.id.localeCompare(b.id),
      ),
    }));
}

// ---------------------------------------------------------------------------
// Load More (stories grid + any paged list): how many items are visible
// after `loads` clicks, starting from `initial`.
// ---------------------------------------------------------------------------

export function visibleCount(total: number, initial: number, loads: number, pageSize = 5): number {
  if (total <= 0) return 0;
  return Math.min(total, initial + loads * pageSize);
}

// ---------------------------------------------------------------------------
// Reorder helpers (admin up/down buttons): move one item one step in an
// already-sorted list. Returns the new order of ids, or null when the
// move is impossible (item missing / already at the edge).
// ---------------------------------------------------------------------------

export function moveItem<T extends { id: string }>(
  items: readonly T[],
  id: string,
  direction: 'up' | 'down',
): T[] | null {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return null;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) return null;
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}

/** Order values to persist after a reorder: 0, 1, 2, … in list order. */
export function orderValuesAfterMove<T extends { id: string }>(
  items: readonly T[],
  id: string,
  direction: 'up' | 'down',
): { id: string; order: number }[] | null {
  const moved = moveItem(items, id, direction);
  if (!moved) return null;
  return moved.map((item, i) => ({ id: item.id, order: i }));
}

// ---------------------------------------------------------------------------
// Validation (admin forms). Returns an error string, or null when valid.
// ---------------------------------------------------------------------------

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateTeamMember(input: {
  fullName: string;
  designation: string;
  bio?: string | null;
  photoUrl?: string | null;
  xUrl?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
  level?: number;
  orderInLevel?: number;
}): string | null {
  if (!input.fullName.trim()) return 'Full name is required';
  if (input.fullName.trim().length > 100) return 'Full name must be 100 characters or fewer';
  if (!input.designation.trim()) return 'Designation is required';
  if (input.designation.trim().length > 100) return 'Designation must be 100 characters or fewer';
  if (input.bio && input.bio.length > 500) return 'Bio must be 500 characters or fewer';
  for (const [field, value] of [
    ['Photo URL', input.photoUrl],
    ['X URL', input.xUrl],
    ['LinkedIn URL', input.linkedinUrl],
    ['GitHub URL', input.githubUrl],
    ['Website URL', input.websiteUrl],
  ] as const) {
    if (value && value.trim() !== '' && !isHttpUrl(value.trim())) {
      return `${field} must be a valid http(s) URL`;
    }
  }
  if (input.level !== undefined && (!Number.isInteger(input.level) || input.level < 1)) {
    return 'Level must be a whole number of 1 or more';
  }
  if (input.orderInLevel !== undefined && (!Number.isInteger(input.orderInLevel) || input.orderInLevel < 0)) {
    return 'Order must be a whole number of 0 or more';
  }
  return null;
}

export function validateStudentReview(input: {
  fullName: string;
  role: string;
  reviewText: string;
  rating?: number;
  photoUrl?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
  order?: number;
}): string | null {
  if (!input.fullName.trim()) return 'Full name is required';
  if (input.fullName.trim().length > 100) return 'Full name must be 100 characters or fewer';
  if (!input.role.trim()) return 'Role is required';
  if (input.role.trim().length > 100) return 'Role must be 100 characters or fewer';
  if (!input.reviewText.trim()) return 'Review text is required';
  if (input.reviewText.trim().length > 2000) return 'Review text must be 2000 characters or fewer';
  if (input.rating !== undefined && (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)) {
    return 'Rating must be a whole number from 1 to 5';
  }
  for (const [field, value] of [
    ['Photo URL', input.photoUrl],
    ['LinkedIn URL', input.linkedinUrl],
    ['GitHub URL', input.githubUrl],
    ['Website URL', input.websiteUrl],
  ] as const) {
    if (value && value.trim() !== '' && !isHttpUrl(value.trim())) {
      return `${field} must be a valid http(s) URL`;
    }
  }
  if (input.order !== undefined && (!Number.isInteger(input.order) || input.order < 0)) {
    return 'Order must be a whole number of 0 or more';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Navbar config (defaults = the current hardcoded navbar, with the
// /success-stories label Eman's decision: 'Spotlight').
// ---------------------------------------------------------------------------

export interface NavItemLike {
  id: string;
  label: string;
  href: string;
  order: number;
  enabled: boolean;
}

/** Pages the Navbar Editor offers as destinations, plus a custom path. */
export const NAV_DESTINATION_OPTIONS: { href: string; label: string }[] = [
  { href: '/', label: 'Home' },
  { href: '/courses', label: 'Courses' },
  { href: '/instructors', label: 'Instructors' },
  { href: '/blog', label: 'Blog' },
  { href: '/success-stories', label: 'Success Stories (Spotlight)' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

export const DEFAULT_NAV_ITEMS: { label: string; href: string }[] = [
  { label: 'Courses', href: '/courses' },
  { label: 'Instructors', href: '/instructors' },
  { label: 'Blog', href: '/blog' },
  { label: 'Spotlight', href: '/success-stories' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

/**
 * The navbar items to render: enabled DB rows in order, or the
 * hardcoded defaults when the table is empty / the migration has not
 * run yet (fail-safe — the nav never breaks). The mobile menu always
 * includes Home first, matching the current hardcoded mobile list.
 */
export function resolveNavItems(dbItems: NavItemLike[] | null | undefined): { label: string; href: string }[] {
  if (!dbItems || dbItems.length === 0) return [...DEFAULT_NAV_ITEMS];
  return dbItems
    .filter((item) => item.enabled)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((item) => ({ label: item.label, href: item.href }));
}

export function validateNavItem(input: { label: string; href: string; order?: number }): string | null {
  if (!input.label.trim()) return 'Label is required';
  if (input.label.trim().length > 50) return 'Label must be 50 characters or fewer';
  const href = input.href.trim();
  if (!href) return 'Destination is required';
  if (href.startsWith('/')) {
    if (href.includes(' ')) return 'Destination path must not contain spaces';
    return null;
  }
  if (!isHttpUrl(href)) return 'Destination must be a site path (starting with /) or a full http(s) URL';
  return null;
}
