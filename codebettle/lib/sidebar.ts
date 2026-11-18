/**
 * Collapsible sidebar preference (Eman, 18 Nov 2026 — premium
 * animated collapsible sidebar, "Glassy SideBar V5" video).
 *
 * The collapsed/expanded state is a CLIENT preference, not a
 * permission and not user data: it lives in a browser cookie
 * (`cb-sidebar-collapsed`), never in the database — the same pattern
 * as the theme preference in lib/theme.ts.
 *
 * Why a cookie and not localStorage: the four portal server layouts
 * read it with `cookies()` and pass the initial state down as a prop,
 * so the first paint already has the right sidebar width. A
 * localStorage-only preference would render expanded server-side and
 * then snap to collapsed after hydration — a visible width jump on
 * every full page load for users who prefer the rail. The toggle
 * writes the cookie, so the choice survives navigation, reloads and
 * new tabs.
 *
 * Pure helpers only — no Next.js imports here so this module is
 * unit-testable with the plain Node test runner.
 */

export const SIDEBAR_COLLAPSED_COOKIE = 'cb-sidebar-collapsed';

/** One year — a sidebar preference is a long-lived choice, not a session. */
export const SIDEBAR_COLLAPSED_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Parse a raw cookie value. Only the exact value '1' means collapsed;
 * anything else (missing, '0', garbage) means expanded — the safe
 * default, so a bad cookie can never hide the sidebar labels.
 */
export function parseSidebarCollapsed(value: string | null | undefined): boolean {
  return value === '1';
}

/**
 * `document.cookie` assignment for the toggle. Path-wide, one year,
 * Lax (first-party navigation only). No HttpOnly flag on purpose: the
 * client toggle needs to write it from the browser. The value is only
 * ever '1' or '0', so there is nothing sensitive in it.
 */
export function sidebarCollapsedCookieString(collapsed: boolean): string {
  return `${SIDEBAR_COLLAPSED_COOKIE}=${collapsed ? '1' : '0'}; Path=/; Max-Age=${SIDEBAR_COLLAPSED_COOKIE_MAX_AGE}; SameSite=Lax`;
}
