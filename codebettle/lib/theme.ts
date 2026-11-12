/**
 * Theme preference (Module 6, Phase 4; three-mode model, theme-selector fix).
 *
 * The theme is a CLIENT preference, not a permission and not user data:
 * it lives in a browser cookie (`cb-theme`), never in the database.
 *
 * Three modes (the user asked for Dark / Light / Default):
 *  - 'dark' / 'light' — explicit choice, always wins.
 *  - 'system' ("Default") — follow the device/OS preference
 *    (`prefers-color-scheme: dark` -> dark, otherwise light), and keep
 *    following it live if the OS theme changes.
 *  - No cookie (or an invalid one) -> 'system'. Legacy 'dark'/'light'
 *    cookies keep working exactly as before.
 *
 * The pre-hydration inline script (THEME_SCRIPT) runs before React
 * hydrates so the first paint already has the right theme (no flash).
 *
 * Root cause note (Nov 2026): `app/globals.css` used to declare the
 * tokens under `@theme inline`. In Tailwind v4 that INLINES the token
 * values into the generated utilities at build time — the compiled
 * CSS had `.bg-dark-card{background-color:#1c1c1c}` (a hex literal,
 * zero `var(--color-*)` references), so the `[data-theme="light"]`
 * overrides never reached any component. Only rules using `var()`
 * directly (body, the Toaster) flipped, which is why the toggle
 * looked broken. Plain `@theme` keeps utilities referencing the
 * variables, so the light overrides apply. Do NOT put `inline` back.
 *
 * Pure helpers only — no Next.js imports here so this module is
 * unit-testable with the plain Node test runner.
 */

export const THEME_COOKIE = 'cb-theme';

/** One year — a theme choice is a long-lived preference, not a session. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The effective theme actually applied to the page. */
export type Theme = 'light' | 'dark';

export const THEMES: Theme[] = ['light', 'dark'];

/** The saved preference: an explicit theme, or 'system' (follow the device). */
export type ThemePreference = 'dark' | 'light' | 'system';

export const THEME_PREFERENCES: ThemePreference[] = ['dark', 'light', 'system'];

/**
 * Parse a raw cookie value as a preference. 'dark'/'light'/'system'
 * parse; anything else (including legacy garbage) is ignored (null =
 * no usable preference, which the callers treat as 'system').
 */
export function parseThemePreference(value: string | null | undefined): ThemePreference | null {
  if (value === 'light' || value === 'dark' || value === 'system') return value;
  return null;
}

/**
 * Parse a raw cookie value as an EXPLICIT theme only. 'system' is not
 * a theme, so it parses to null — the server layout uses this: a
 * 'system' cookie (or no/invalid cookie) means NO data-theme attribute
 * server-side, and the pre-hydration script resolves the device theme.
 */
export function parseThemeCookie(value: string | null | undefined): Theme | null {
  const preference = parseThemePreference(value);
  if (preference === 'light' || preference === 'dark') return preference;
  return null;
}

/**
 * Resolve the effective theme: an explicit preference wins; 'system'
 * (or no preference) follows the device/OS preference. `prefersDark`
 * is the result of `window.matchMedia('(prefers-color-scheme: dark)').matches`.
 */
export function resolveTheme(preference: ThemePreference | null | undefined, prefersDark: boolean): Theme {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return prefersDark ? 'dark' : 'light';
}

/**
 * `document.cookie` assignment for the client provider. Path-wide, one
 * year, Lax (first-party navigation only). No HttpOnly flag on purpose:
 * the pre-hydration script and the provider both need to read it from
 * the browser. The value is only ever 'light', 'dark' or 'system', so
 * there is nothing sensitive in it.
 */
export function themeCookieString(preference: ThemePreference): string {
  return `${THEME_COOKIE}=${preference}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
}

/**
 * Pre-hydration inline script, injected by the root layout with the
 * per-request CSP nonce (proxy.ts). It runs before React hydrates and
 * before the first paint, so the page never flashes the wrong theme:
 *
 *  1. Read the `cb-theme` cookie; if it is 'light' or 'dark', use it.
 *  2. If it is 'system', or missing/invalid, fall back to the
 *     device/OS preference (`prefers-color-scheme: dark`).
 *  3. Set `data-theme` on <html> and `colorScheme` on <html> (so
 *     native controls and scrollbars follow the theme too).
 *
 * Kept as a single string (no `</script>` sequence inside, no `eval`)
 * so the layout can inject it with dangerouslySetInnerHTML and the
 * tests can assert on its exact content.
 */
export const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=(light|dark|system)/);var t=(m&&m[1]!=='system')?m[1]:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;}catch(e){}})();`;
