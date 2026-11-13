/**
 * Admin access control (Item G).
 *
 * The admin portal has one area per sidebar section. A full admin (role
 * `admin` with NO permissions restriction — `adminPermissions` NULL in the
 * DB) can see everything, exactly as before. A restricted admin has an
 * explicit per-area map stored as JSON on the User row
 * (`User.adminPermissions`, same nullable-Json pattern as
 * `notificationPrefs`): only the areas set to `true` are granted.
 *
 * Enforcement is server-side, never UI-only:
 * - Pages: app/admin/layout.tsx reads the session user's permissions and
 *   the requested path (via the `x-pathname` header set in proxy.ts) and
 *   redirects away from areas that were not granted. It also filters the
 *   sidebar so ungranted areas are not shown at all.
 * - APIs: lib/api-helpers.ts `requireAdminArea` / `requireAdminAreas` /
 *   `requireFullAdmin` gate the /api/admin/* routes per area.
 *
 * The "access" area itself (granting/revoking admin access and editing
 * permissions) is NOT grantable: only full admins can open /admin/access
 * or call its API, so a restricted admin can never escalate themselves.
 *
 * Pure functions only — no Next.js imports, unit-testable.
 */

/** One checkbox in the access UI, one sidebar section, one guard. */
export interface AdminArea {
  key: AdminAreaKey;
  label: string;
  /** Sidebar href (also the path prefix the layout guard matches). */
  href: string;
  /** Short description shown next to the checkbox in /admin/access. */
  description: string;
}

export type AdminAreaKey =
  | 'dashboard'
  | 'courses'
  | 'students'
  | 'instructors'
  | 'enrollments'
  | 'coupons'
  | 'announcements'
  | 'messages'
  | 'requests'
  | 'notifications'
  | 'communications'
  | 'blog'
  | 'content'
  | 'reports'
  | 'certificates'
  | 'applications'
  | 'forms'
  | 'success-stories'
  | 'success-stories-management'
  | 'reviews'
  | 'email-templates'
  | 'navbar-editor'
  | 'book-a-call'
  | 'ambassadors'
  | 'subscribers'
  | 'settings'
  | 'page-builder';

/**
 * Every admin area, in sidebar order — this list is the single source of
 * truth for the nav (app/admin/layout.tsx), the checkboxes
 * (app/admin/access), and the guards. It must cover every page under
 * /admin (see ADMIN_AREA_PATHS below for the sub-page mapping). If a new
 * admin section is added, add it here first.
 */
export const ADMIN_AREAS: readonly AdminArea[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/admin/dashboard', description: 'Overview stats and recent activity' },
  { key: 'courses', label: 'Courses', href: '/admin/courses', description: 'Create, edit and publish courses, including course detail pages' },
  { key: 'students', label: 'Students', href: '/admin/students', description: 'Student list and profiles, including CSV import' },
  { key: 'instructors', label: 'Instructors', href: '/admin/instructors', description: 'Instructor list and profiles' },
  { key: 'enrollments', label: 'Enrollments', href: '/admin/enrollments', description: 'Enrolments, payments and completion' },
  { key: 'coupons', label: 'Coupon Codes', href: '/admin/coupons', description: 'Discount coupon codes' },
  { key: 'announcements', label: 'Announcements', href: '/admin/announcements', description: 'Site-wide and course announcements' },
  { key: 'messages', label: 'Messages', href: '/admin/messages', description: 'Contact messages from visitors' },
  // Phase 3, Worker C: student support requests. A NEW area (not folded
  // into 'messages') because the contact-message inbox must stay
  // separate from the student-request queue.
  { key: 'requests', label: 'Requests', href: '/admin/requests', description: 'Student support requests (complaints, feedback, course issues)' },
  { key: 'notifications', label: 'Notifications', href: '/admin/notifications', description: 'In-app notifications' },
  // Phase 3 (Module 14): the centralized communications dashboard —
  // announcements, targeted notifications, read receipts and request
  // summaries, read/aggregated over the data the other Phase 3 workers
  // create. Restricted admins do NOT get it by default (secure default:
  // missing keys are denied), so grant it explicitly in /admin/access.
  { key: 'communications', label: 'Communications', href: '/admin/communications', description: 'Announcements, targeted notifications, read receipts and request summaries' },
  { key: 'blog', label: 'Blog', href: '/admin/blog', description: 'Blog posts, including PDF uploads' },
  { key: 'content', label: 'Content', href: '/admin/content', description: 'Site content pages' },
  { key: 'reports', label: 'Reports', href: '/admin/reports', description: 'Reports and exports' },
  { key: 'certificates', label: 'Certificates', href: '/admin/certificates', description: 'Issued certificates' },
  { key: 'applications', label: 'Applications', href: '/admin/applications', description: 'Instructor applications' },
  // Phase 6: forms builder (forms for any purpose). A NEW area (not
  // folded into 'content') because form submissions are user data
  // with their own review workflow. Restricted admins do NOT get it
  // by default (secure default: missing keys are denied).
  { key: 'forms', label: 'Forms', href: '/admin/forms', description: 'Forms builder (any purpose)' },
  // Success story submissions: student success stories with their own
  // review workflow (pending -> under review -> approved / rejected).
  // A NEW area (not folded into 'forms') because stories are published
  // content with photos, videos and evidence. Restricted admins do NOT
  // get it by default (secure default: missing keys are denied).
  { key: 'success-stories', label: 'Success Stories', href: '/admin/success-stories', description: 'Student success story submissions (review, approve, feature)' },
  // Success Stories Management (PR #32): the single management surface
  // for the whole /success-stories page — video & vision layout, team,
  // stats, and story visibility/ordering. Separate from
  // 'success-stories' (the submission review queue) because it manages
  // the published page, not individual submissions.
  { key: 'success-stories-management', label: 'Success Stories Management', href: '/admin/success-stories-management', description: 'Manage the Success Stories page: video & vision, team, stats, story visibility' },
  // Home reviews carousel (PR #32): admin-managed student reviews
  // shown on the home landing page. Below Success Stories in the nav.
  { key: 'reviews', label: 'Reviews', href: '/admin/reviews', description: 'Home page student reviews (carousel, enable/disable, add, edit)' },
  // Email builder: admin email templates (GHL-style) with subject
  // editing and placeholders. A NEW area (not folded into
  // 'notifications') because templates are their own workflow.
  // Restricted admins do NOT get it by default (secure default:
  // missing keys are denied).
  { key: 'email-templates', label: 'Email Templates', href: '/admin/email-templates', description: 'Email templates (GHL-style builder with placeholders)' },
  // Navbar Editor (PR #32): nav items (label, destination, order,
  // enable/disable) and the navbar logo.
  { key: 'navbar-editor', label: 'Navbar Editor', href: '/admin/navbar-editor', description: 'Navbar items and logo (label, destination, order, enable/disable)' },
  // Footer forms (PR #33): the three footer additions each get their
  // own review section. A NEW area each (not folded into 'messages')
  // because they are separate public forms with their own workflow
  // (book-a-call status, ambassador approve/reject, subscriber list).
  // Restricted admins do NOT get them by default (secure default:
  // missing keys are denied).
  { key: 'book-a-call', label: 'Book a Call', href: '/admin/book-a-call', description: 'Free career-guidance call requests (review, mark contacted/done)' },
  { key: 'ambassadors', label: 'Ambassadors', href: '/admin/ambassadors', description: 'Campus ambassador applications (review, approve/reject)' },
  { key: 'subscribers', label: 'Subscribers', href: '/admin/subscribers', description: 'Newsletter subscribers from the footer' },
  { key: 'settings', label: 'Settings', href: '/admin/settings', description: 'Site settings' },
  // Page Builder: block-based custom pages (title + slug + blocks,
  // published live at /pages/<slug>). A NEW area, placed LAST in the
  // sidebar by Eman's instruction (13 Nov 2026) — its own section, not
  // mixed into another one. Restricted admins do NOT get it by default
  // (secure default: missing keys are denied).
  { key: 'page-builder', label: 'Page Builder', href: '/admin/page-builder', description: 'Block-based custom pages (published live at /pages/<slug>)' },
] as const;

export const ADMIN_AREA_KEYS: readonly AdminAreaKey[] = ADMIN_AREAS.map((a) => a.key);

/**
 * The stored permissions shape. Declared as a `type` (not an `interface`)
 * on purpose: like NotificationPrefs, the Json column needs an index
 * signature, which a type alias carries implicitly.
 *
 * Stored value rules:
 * - NULL / undefined (no value at all) = FULL admin: every area granted,
 *   including areas added later. This is what the first-run setup creates
 *   and what every existing admin has, so nothing changes for them.
 * - An object = RESTRICTED admin: only keys set to `true` are granted.
 *   Missing keys and non-boolean values are denied (secure default, so a
 *   future area is denied until explicitly granted).
 * - An object with every key `true` behaves like a full admin for the
 *   areas that exist today, but a future area is still denied until
 *   granted; the access UI therefore saves "all checked" as NULL.
 */
export type AdminPermissions = {
  [K in AdminAreaKey]?: boolean;
};

/**
 * Safely read a Json column value as AdminPermissions.
 * Returns undefined (full admin) for NULL / non-object values; otherwise
 * a map containing only known area keys with boolean values.
 */
export function toAdminPermissions(value: unknown): AdminPermissions | undefined {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const out: AdminPermissions = {};
  for (const key of ADMIN_AREA_KEYS) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }
  return out;
}

/** NULL/undefined permissions = unrestricted full admin. */
export function isFullAdmin(permissions: AdminPermissions | undefined | null): boolean {
  return permissions === undefined || permissions === null;
}

/** Does this permissions value grant this area? Full admins get everything. */
export function hasAdminArea(
  permissions: AdminPermissions | undefined | null,
  area: AdminAreaKey,
): boolean {
  if (isFullAdmin(permissions)) return true;
  return permissions?.[area] === true;
}

/** Does this permissions value grant at least one of these areas? */
export function hasAnyAdminArea(
  permissions: AdminPermissions | undefined | null,
  areas: readonly AdminAreaKey[],
): boolean {
  return areas.some((area) => hasAdminArea(permissions, area));
}

/** The first area this admin may open — used as the redirect target when they hit a denied area. Null when no area is granted. */
export function firstGrantedArea(
  permissions: AdminPermissions | undefined | null,
): AdminArea | null {
  return ADMIN_AREAS.find((area) => hasAdminArea(permissions, area.key)) ?? null;
}

/**
 * Map an /admin/* pathname to its area. Sub-pages belong to their parent
 * area: /admin/courses/new and /admin/courses/[id] are `courses`,
 * /admin/students/import is `students`. Returns null for paths that are
 * not an admin area page (/admin itself, unknown paths).
 *
 * `access` is a real area key for guard purposes but has no checkbox: it
 * is only ever granted to full admins (see isFullAdmin above).
 */
export function areaForAdminPath(pathname: string): AdminAreaKey | 'access' | null {
  const path = pathname.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  if (path === '/admin/access') return 'access';
  for (const area of ADMIN_AREAS) {
    if (path === area.href || path.startsWith(`${area.href}/`)) return area.key;
  }
  return null;
}

/**
 * Normalise a permissions map received from the access UI before saving.
 * - Unknown keys are dropped; non-boolean values are dropped.
 * - All 27 areas true collapses to undefined (full admin), so "grant
 *   everything" stays a real full admin.
 * - No areas true stays `{}` (restricted admin with nothing granted).
 * Returns undefined for full admin, otherwise the restricted map.
 */
export function normaliseAdminPermissions(
  input: Record<string, unknown> | null | undefined,
): AdminPermissions | undefined {
  if (input === null || input === undefined) return undefined;
  const parsed = toAdminPermissions(input);
  if (!parsed) return undefined;
  const granted = ADMIN_AREA_KEYS.filter((key) => parsed[key] === true);
  if (granted.length === 0) return {};
  if (granted.length === ADMIN_AREA_KEYS.length) return undefined;
  const out: AdminPermissions = {};
  for (const key of granted) out[key] = true;
  return out;
}
