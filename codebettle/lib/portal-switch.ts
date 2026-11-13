/**
 * Module 17 — dual-role portal switching (Phase 2).
 *
 * Pure helpers, no Next.js imports, so they are unit-testable in node.
 *
 * The switch itself is plain navigation: the admin and instructor
 * layouts are guarded server-side by the Phase 2 capability flags
 * (app/admin/layout.tsx requires hasAdminCapability, app/instructor/
 * layout.tsx requires hasTeacherCapability), so no session change,
 * token, or client-sent role is involved. Clicking the switch link
 * keeps the user signed in — the session cookie is untouched and the
 * target layout re-reads the same session from the user record.
 *
 * Visibility rule (UI only — the layout guards are the enforcement):
 * - In the admin portal, "Switch to Teacher Portal" appears ONLY for
 *   users with the teacher capability (isTeacher flag, or legacy
 *   primary role 'instructor').
 * - In the instructor portal, "Switch to Admin Panel" appears ONLY
 *   for users with the admin capability (isAdmin flag, or legacy
 *   primary role 'admin').
 * - A normal teacher, a normal admin, and a pure student see no
 *   switch option anywhere. A teacher+admin sees the way over AND
 *   the way back.
 * - The student portal has no switch option: student-only flows stay
 *   keyed to the PRIMARY role (see lib/rbac.ts), and a dual-role user
 *   reaches the other portals from either of them.
 *
 * Landing: the other portal's dashboard (/admin/dashboard or
 * /instructor/dashboard). Simplest and predictable — the user lands
 * on an overview, not mid-task in a section whose counterpart may
 * not exist. One caveat, by design: a RESTRICTED admin (per-area
 * permissions) who switches to /admin/dashboard without the
 * dashboard area granted is bounced by the admin layout's per-area
 * guard to their first granted area — still inside the admin portal,
 * still enforced server-side.
 */
import { hasAdminCapability, hasTeacherCapability } from './rbac';
import type { SessionUser } from './services/auth-service';

export type PortalId = 'admin' | 'instructor' | 'student';

export interface PortalSwitchTarget {
  /** Portal the link leads to. */
  target: Exclude<PortalId, 'student'>;
  /** Dashboard of the target portal — the landing page after switching. */
  href: string;
  /** Exact button label shown in the topbar. */
  label: 'Switch to Teacher Portal' | 'Switch to Admin Panel';
}

const PORTAL_PREFIXES: Array<[string, PortalId]> = [
  ['/instructor', 'instructor'],
  ['/student', 'student'],
];

/**
 * Which portal a pathname belongs to, from its prefix.
 * Returns null for public pages (/, /courses, …) — no portal, no switch.
 * The admin prefix is the secret base path (PR #33) — passed in by the
 * portal layout (a server component reads it from the env var); the
 * dev default is 'admin', so existing callers keep working.
 */
export function portalFromPathname(
  pathname: string | null | undefined,
  adminBasePath = 'admin',
): PortalId | null {
  if (!pathname) return null;
  const path = pathname.split('?')[0].split('#')[0];
  if (path === `/${adminBasePath}` || path.startsWith(`/${adminBasePath}/`)) return 'admin';
  for (const [prefix, portal] of PORTAL_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return portal;
  }
  return null;
}

/**
 * The switch option for a user currently in the portal that `pathname`
 * belongs to, or null when there is none. The capability checks are
 * the same helpers the layout guards use — the UI mirrors the backend,
 * it never grants anything itself.
 */
export function getPortalSwitch(
  user: Pick<SessionUser, 'role' | 'isAdmin' | 'isTeacher'> | null | undefined,
  pathname: string | null | undefined,
  adminBasePath = 'admin',
): PortalSwitchTarget | null {
  if (!user) return null;
  const current = portalFromPathname(pathname, adminBasePath);
  if (current === 'admin' && hasTeacherCapability(user)) {
    return { target: 'instructor', href: '/instructor/dashboard', label: 'Switch to Teacher Portal' };
  }
  if (current === 'instructor' && hasAdminCapability(user)) {
    return { target: 'admin', href: `/${adminBasePath}/dashboard`, label: 'Switch to Admin Panel' };
  }
  return null;
}

/**
 * The public navbar's portal link: the user's PRIMARY portal
 * (role is the primary role — see lib/rbac.ts). A teacher+admin
 * whose primary role is 'instructor' lands on the instructor
 * dashboard from the navbar and uses the in-portal switcher to
 * reach the admin panel, and vice versa. Accepts a plain string
 * role (Navbar's session prop types it as string); an unknown role
 * yields no link rather than a broken href. The admin dashboard is
 * the secret base path (PR #33) — the Navbar receives it from its
 * server-rendered parent; the dev default is 'admin'.
 */
export function primaryPortalDashboard(
  user: { role: string } | null | undefined,
  adminBasePath = 'admin',
): string | null {
  if (!user) return null;
  if (user.role === 'admin') return `/${adminBasePath}/dashboard`;
  if (user.role === 'instructor' || user.role === 'student') {
    return `/${user.role}/dashboard`;
  }
  return null;
}
