/**
 * User menu destinations (profile avatar dropdown).
 *
 * Pure helpers, no Next.js imports, so they are unit-testable in node.
 *
 * The destinations are derived from the CURRENT portal prefix in the
 * pathname — not from `portalFromPathname` in lib/portal-switch.ts,
 * which does not know `/applicant` (its PORTAL_PREFIXES only has
 * admin/instructor/student) and must stay that way: the bell link in
 * PortalLayout relies on that fallback in the applicant portal (there
 * is no /applicant/notifications page), so "fixing" it globally would
 * 404 the bell. The avatar menu, by contrast, must land in the portal
 * the user is actually looking at — an applicant clicking their avatar
 * inside /applicant/... gets /applicant/profile, not a fallback based
 * on their primary role.
 *
 * Outside any portal (the public Navbar) the pathname carries no
 * portal, so the destinations fall back to the user's primary role.
 * Settings links to the profile page where no portal settings page
 * exists — only /admin/settings exists — so the menu never links to
 * a dead page.
 */

export interface UserMenuLinks {
  profileHref: string;
  settingsHref: string;
}

const PORTAL_PREFIXES: Array<[string, string]> = [
  ['/instructor', 'instructor'],
  ['/student', 'student'],
  ['/applicant', 'applicant'],
];

function linksForPortal(portal: string, adminBasePath = 'admin'): UserMenuLinks {
  if (portal === 'admin') {
    return { profileHref: `/${adminBasePath}/profile`, settingsHref: `/${adminBasePath}/settings` };
  }
  return { profileHref: `/${portal}/profile`, settingsHref: `/${portal}/profile` };
}

/**
 * Profile/Settings destinations for the avatar menu.
 * `pathname` is the current route (null/undefined on public pages);
 * `fallbackRole` is the user's primary role, used when the pathname
 * is outside any portal. An unknown role lands on the student
 * profile — the safest portal that always exists. The admin prefix is
 * the secret base path (PR #33) — passed in by the portal layout; the
 * dev default is 'admin'.
 */
export function portalMenuLinks(
  pathname: string | null | undefined,
  fallbackRole: string,
  adminBasePath = 'admin',
): UserMenuLinks {
  if (pathname) {
    const path = pathname.split('?')[0].split('#')[0];
    if (path === `/${adminBasePath}` || path.startsWith(`/${adminBasePath}/`)) {
      return linksForPortal('admin', adminBasePath);
    }
    for (const [prefix, portal] of PORTAL_PREFIXES) {
      if (path === prefix || path.startsWith(`${prefix}/`)) {
        return linksForPortal(portal, adminBasePath);
      }
    }
  }
  switch (fallbackRole) {
    case 'admin':
    case 'instructor':
    case 'student':
    case 'applicant':
      return linksForPortal(fallbackRole, adminBasePath);
    default:
      return { profileHref: '/student/profile', settingsHref: '/student/profile' };
  }
}
