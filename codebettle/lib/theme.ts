/**
 * Theme preference (Module 6, Phase 4).
 *
 * The theme is a CLIENT preference, not a permission and not user data:
 * it lives in a browser cookie (`cb-theme`), never in the database.
 *
 * Rules (decided by the user):
 *  - No cookie yet -> the device/OS theme wins
 *    (`prefers-color-scheme: dark` -> dark, otherwise light).
 *  - A manual change writes the cookie; the next visit reuses it.
 *  - The pre-hydration inline script (THEME_SCRIPT) runs before React
 *    hydrates so the first paint already has the right theme (no flash).
 *
 * Pure helpers only — no Next.js imports here so this module is
 * unit-testable with the plain Node test runner.
 */

export const THEME_COOKIE = 'cb-theme';

/** One year — a theme choice is a long-lived preference, not a session. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type Theme = 'light' | 'dark';

export const THEMES: Theme[] = ['light', 'dark'];

/** Parse a raw cookie value. Anything that is not exactly 'light' or 'dark' is ignored. */
export function parseThemeCookie(value: string | null | undefined): Theme | null {
  if (value === 'light' || value === 'dark') return value;
  return null;
}

/**
 * Resolve the effective theme: a saved cookie wins, otherwise the
 * device/OS preference. `prefersDark` is the result of
 * `window.matchMedia('(prefers-color-scheme: dark)').matches`.
 */
export function resolveTheme(cookieValue: string | null | undefined, prefersDark: boolean): Theme {
  return parseThemeCookie(cookieValue) ?? (prefersDark ? 'dark' : 'light');
}

/** The opposite theme — what the toggle switches to. */
export function toggleTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

/**
 * `document.cookie` assignment for the client toggle. Path-wide, one
 * year, Lax (first-party navigation only). No HttpOnly flag on purpose:
 * the pre-hydration script and the provider both need to read it from
 * the browser. The value is only ever 'light' or 'dark', so there is
 * nothing sensitive in it.
 */
export function themeCookieString(theme: Theme): string {
  return `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
}

/**
 * Pre-hydration inline script, injected by the root layout with the
 * per-request CSP nonce (proxy.ts). It runs before React hydrates and
 * before the first paint, so the page never flashes the wrong theme:
 *
 *  1. Read the `cb-theme` cookie; if it is 'light' or 'dark', use it.
 *  2. Otherwise fall back to the device/OS preference
 *     (`prefers-color-scheme: dark`).
 *  3. Set `data-theme` on <html>; globals.css keys the light tokens
 *     off `[data-theme="light"]` (dark is the default, no attribute
 *     needed — but the script always sets one for consistency).
 *
 * Kept as a single string (no `</script>` sequence inside, no `eval`)
 * so the layout can inject it with dangerouslySetInnerHTML and the
 * tests can assert on its exact content.
 */
export const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=(light|dark)/);var t=m?m[1]:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;
