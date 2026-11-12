// Module 6 — light/dark theme (Phase 4; three-mode model, theme-selector fix).
//
// Static + unit tests for the theme mechanism. They do not render
// pixels — see RUNBOOK.md Phase 6 for how the live site is checked
// visually. The conversion guard at the bottom fails if a new
// hardcoded dark-only text colour is added to a file Worker A owns.
//
// Three modes: 'dark' / 'light' (explicit) and 'system' ("Default",
// follow the device/OS preference live). The old binary toggle
// (`toggleTheme`) is gone — the menu's setPreference replaces it,
// so there is no toggle test to keep.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  THEME_COOKIE,
  THEME_PREFERENCES,
  THEME_SCRIPT,
  parseThemeCookie,
  parseThemePreference,
  resolveTheme,
  themeCookieString,
} from '../lib/theme';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

// ---------------------------------------------------------------------------
// Cookie / theme helpers (lib/theme.ts)
// ---------------------------------------------------------------------------

test('theme preference parsing: dark/light/system parse; anything else is ignored', () => {
  assert.deepEqual(THEME_PREFERENCES, ['dark', 'light', 'system']);
  assert.equal(parseThemePreference('dark'), 'dark');
  assert.equal(parseThemePreference('light'), 'light');
  assert.equal(parseThemePreference('system'), 'system');
  assert.equal(parseThemePreference('Light'), null);
  assert.equal(parseThemePreference('SYSTEM'), null);
  assert.equal(parseThemePreference(''), null);
  assert.equal(parseThemePreference(null), null);
  assert.equal(parseThemePreference(undefined), null);
  assert.equal(parseThemePreference('dark; Path=/'), null);
  assert.equal(parseThemePreference('bogus'), null);
});

test('theme cookie parsing (explicit theme only): system is NOT a theme', () => {
  // Legacy 'dark'/'light' cookies keep working exactly as before.
  assert.equal(parseThemeCookie('light'), 'light');
  assert.equal(parseThemeCookie('dark'), 'dark');
  // 'system' parses to null — the server layout renders NO data-theme
  // attribute for it and the pre-hydration script resolves the device.
  assert.equal(parseThemeCookie('system'), null);
  assert.equal(parseThemeCookie('Light'), null);
  assert.equal(parseThemeCookie(''), null);
  assert.equal(parseThemeCookie(null), null);
  assert.equal(parseThemeCookie(undefined), null);
  assert.equal(parseThemeCookie('dark; Path=/'), null);
  assert.equal(parseThemeCookie('bogus'), null);
});

test('theme resolution: explicit preference wins, system follows the device', () => {
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme(null, false), 'light');
  assert.equal(resolveTheme(undefined, true), 'dark');
  assert.equal(resolveTheme(undefined, false), 'light');
});

test('theme cookie string: path-wide, one year, Lax, name cb-theme, all three values', () => {
  assert.equal(themeCookieString('dark'), 'cb-theme=dark; Path=/; Max-Age=31536000; SameSite=Lax');
  assert.equal(themeCookieString('light'), 'cb-theme=light; Path=/; Max-Age=31536000; SameSite=Lax');
  assert.equal(themeCookieString('system'), 'cb-theme=system; Path=/; Max-Age=31536000; SameSite=Lax');
  assert.equal(THEME_COOKIE, 'cb-theme');
});

test('pre-hydration script: cookie first, device fallback, sets data-theme + colorScheme', () => {
  assert.match(THEME_SCRIPT, /cb-theme=\(light\|dark\|system\)/);
  assert.match(THEME_SCRIPT, /prefers-color-scheme: dark/);
  assert.match(THEME_SCRIPT, /setAttribute\('data-theme'/);
  assert.match(THEME_SCRIPT, /style\.colorScheme=t/);
  assert.match(THEME_SCRIPT, /m\[1\]!=='system'/, 'a system cookie falls through to the device');
  assert.equal(THEME_SCRIPT.includes('</script>'), false, 'script must not contain a closing tag');
  assert.equal(THEME_SCRIPT.includes('eval'), false, 'no eval in the theme script');
});

// The script runs in a real browser before hydration. Execute it here
// against fake document/window objects to prove the branching works.
function runThemeScript(cookie: string, prefersDark: boolean): { theme: string | null; colorScheme: string } {
  let theme: string | null = null;
  const style: { colorScheme: string } = { colorScheme: '' };
  const documentFake = {
    cookie,
    documentElement: { setAttribute: (_k: string, v: string) => { theme = v; }, style },
  };
  const windowFake = {
    matchMedia: (_q: string) => ({ matches: prefersDark }),
  };
  const fn = new Function('document', 'window', THEME_SCRIPT);
  fn(documentFake, windowFake);
  return { theme, colorScheme: style.colorScheme };
}

test('pre-hydration script behaviour: explicit cookie wins, system/garbage/no cookie follow the device', () => {
  // Legacy explicit cookies still win over the device.
  assert.deepEqual(runThemeScript('cb-theme=dark', false), { theme: 'dark', colorScheme: 'dark' });
  assert.deepEqual(runThemeScript('cb-theme=light', true), { theme: 'light', colorScheme: 'light' });
  assert.deepEqual(runThemeScript('foo=bar; cb-theme=light', true), { theme: 'light', colorScheme: 'light' });
  // 'system' cookie: NOT an explicit theme — the device decides.
  assert.deepEqual(runThemeScript('cb-theme=system', true), { theme: 'dark', colorScheme: 'dark' });
  assert.deepEqual(runThemeScript('cb-theme=system', false), { theme: 'light', colorScheme: 'light' });
  assert.deepEqual(runThemeScript('foo=bar; cb-theme=system', false), { theme: 'light', colorScheme: 'light' });
  // No cookie at all: the device decides.
  assert.deepEqual(runThemeScript('', true), { theme: 'dark', colorScheme: 'dark' });
  assert.deepEqual(runThemeScript('', false), { theme: 'light', colorScheme: 'light' });
  // Garbage cookie: treated as no cookie — the device decides.
  assert.deepEqual(runThemeScript('cb-theme=bogus', true), { theme: 'dark', colorScheme: 'dark' });
  assert.deepEqual(runThemeScript('cb-theme=bogus', false), { theme: 'light', colorScheme: 'light' });
});

// ---------------------------------------------------------------------------
// globals.css — light token set
// ---------------------------------------------------------------------------

test('light tokens: full light set under [data-theme="light"]', () => {
  const css = read('app/globals.css');
  const light = css.match(/\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/);
  assert.ok(light, 'light token block exists');
  const block = light[1];
  for (const token of [
    '--color-primary: #F5C518',
    '--color-primary-text: #8A6D00',
    '--color-ink: #111111',
    '--color-dark: #FFFFFF',
    '--color-dark-card: #FFFFFF',
    '--color-dark-border: #E5E7EB',
    '--color-muted: #6B7280',
    '--color-background: #FFFFFF',
    '--color-surface: #F5F5F4',
    '--color-foreground: #111111',
  ]) {
    assert.ok(block.includes(token), `light block sets ${token}`);
  }
  // Dark defaults are unchanged (dark is the default theme).
  assert.match(css, /--color-primary-text: #F5C518;/);
  assert.match(css, /--color-ink: #111111;/);
});

test('light tokens: semantic -300/-400 colours remapped to dark shades', () => {
  const css = read('app/globals.css');
  const light = css.match(/\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/)![1];
  for (const [token, hex] of [
    ['--color-red-300', '#B91C1C'],
    ['--color-red-400', '#DC2626'],
    ['--color-green-300', '#15803D'],
    ['--color-green-400', '#15803D'],
    ['--color-blue-400', '#1D4ED8'],
    ['--color-yellow-400', '#A16207'],
    ['--color-amber-400', '#92400E'],
    ['--color-purple-400', '#7E22CE'],
    ['--color-pink-400', '#BE185D'],
    ['--color-orange-400', '#C2410C'],
    ['--color-cyan-400', '#0E7490'],
    ['--color-gray-400', '#4B5563'],
  ]) {
    assert.ok(light.includes(`${token}: ${hex}`), `light remaps ${token} to ${hex}`);
  }
});

test('light tokens: elevation shadows soften, glass-card + scrollbar go light', () => {
  const css = read('app/globals.css');
  assert.match(css, /\[data-theme="light"\][\s\S]*?--shadow-elev-1: 0 1px 2px rgba\(0, 0, 0, 0\.08\)/);
  assert.match(css, /\[data-theme="light"\] \.glass-card\s*\{[^}]*background: rgba\(255, 255, 255, 0\.85\)/);
  assert.match(css, /\[data-theme="light"\] ::-webkit-scrollbar-track\s*\{[^}]*background: #F1F1F1/);
});

test('light tokens: gradient-text gets a dark-gold override (bright gold is 1.63:1 on white)', () => {
  // .gradient-text is used in ~25 places (logos, hero headings/stats,
  // About/Blog/Contact/Courses/Instructors, Footer, CTABanner, auth).
  // The dark gradient (#F5C518 -> #FDE68A) is unreadable on white, so
  // light mode needs dark golds: #8A6D00 4.92:1, #6B5400 7.26:1.
  const css = read('app/globals.css');
  const m = css.match(/\[data-theme="light"\] \.gradient-text\s*\{([\s\S]*?)\}/);
  assert.ok(m, 'light .gradient-text override exists');
  assert.match(m[1], /linear-gradient\(135deg, #8A6D00, #6B5400\)/);
  assert.equal(m[1].includes('#F5C518'), false, 'no bright gold in the light gradient');
  assert.equal(m[1].includes('#FDE68A'), false, 'no pale gold in the light gradient');
});

test('globals.css: plain @theme, NOT @theme inline (root cause of the broken toggle)', () => {
  // Tailwind v4 `@theme inline` inlines token values into the
  // generated utilities at build time (`.bg-dark-card{background-
  // color:#1c1c1c}`), so the [data-theme="light"] overrides never
  // reach any component. Plain @theme keeps utilities referencing
  // the variables (var(--color-dark-card)), so light mode applies.
  const css = read('app/globals.css');
  assert.equal(css.includes('@theme inline'), false, '@theme inline must never come back');
  assert.match(css, /@theme\s*\{/);
});

test('globals.css: no comment closes mid-line (a stray */ once swallowed the light block)', () => {
  // Regression: "`bg-*/border-*/ring-primary`" inside a comment closed
  // the comment early; Lightning CSS then dropped the whole
  // [data-theme="light"] token block from the built CSS while the
  // build still exited 0. Every */ in this file must end its line
  // (allowing only trailing whitespace after it).
  const css = read('app/globals.css');
  const bad: string[] = [];
  css.split('\n').forEach((line, i) => {
    const idx = line.indexOf('*/');
    if (idx !== -1 && line.slice(idx + 2).trim() !== '') bad.push(`${i + 1}: ${line.trim()}`);
  });
  assert.deepEqual(bad, [], 'comment terminator mid-line');
});

// ---------------------------------------------------------------------------
// Root layout + provider + toggle wiring
// ---------------------------------------------------------------------------

test('root layout: nonce-carrying pre-hydration script + cookie-driven data-theme', () => {
  const layout = read('app/layout.tsx');
  assert.match(layout, /THEME_SCRIPT/);
  assert.match(layout, /<script nonce=\{nonce\}/);
  assert.match(layout, /parseThemeCookie\(\(await cookies\(\)\)\.get\(THEME_COOKIE\)/);
  assert.match(layout, /data-theme=\{theme \?\? undefined\}/);
  assert.match(layout, /<html lang="en" className="h-full"[^>]*suppressHydrationWarning/);
  assert.match(layout, /\(await headers\(\)\)\.get\('x-nonce'\)/);
  assert.match(layout, /<ThemeProvider>/);
  // Three-mode model: a 'system' (or missing/invalid) cookie means
  // NO server-side data-theme — the pre-hydration script resolves
  // the device theme. parseThemeCookie returns null exactly then.
  assert.match(layout, /parseThemeCookie returns null for 'system'/);
  // Phase 6 behaviour preserved.
  assert.match(layout, /MotionConfig\s+reducedMotion="user"/);
});

test('root layout: Toaster uses theme tokens, not hardcoded dark colours', () => {
  const layout = read('app/layout.tsx');
  assert.match(layout, /background: 'var\(--color-dark-card\)'/);
  assert.match(layout, /color: 'var\(--color-foreground\)'/);
  assert.match(layout, /border: '1px solid var\(--color-dark-border\)'/);
  assert.equal(layout.includes("background: '#1C1C1C'"), false, 'hardcoded dark Toaster bg is gone');
});

test('theme provider: preference state, setPreference writes data-theme + cookie, system follows the OS live', () => {
  const provider = read('components/theme/ThemeProvider.tsx');
  // Context carries the saved preference + the effective theme.
  assert.match(provider, /preference: ThemePreference;/);
  assert.match(provider, /theme: Theme;/);
  assert.match(provider, /setPreference: \(preference: ThemePreference\) => void;/);
  assert.match(provider, /export function useTheme/);
  // First render reads the cookie (the source of truth — data-theme
  // only ever holds the EFFECTIVE theme) and falls back to 'system'.
  assert.match(provider, /document\.cookie\.match\(\/\(\?:\^\|;\\s\*\)cb-theme=\(light\|dark\|system\)\//);
  assert.match(provider, /parseThemePreference\(match\?\.\[1\]\) \?\? 'system'/);
  // Initial effective theme agrees with the pre-hydration script.
  assert.match(provider, /getAttribute\('data-theme'\)/);
  assert.match(provider, /resolveTheme\(preference, window\.matchMedia\('\(prefers-color-scheme: dark\)'\)\.matches\)/);
  // setPreference: resolve the effective theme, apply it to <html>
  // (attribute + colorScheme), persist the PREFERENCE in the cookie.
  assert.match(provider, /const effective = resolveTheme\(next, window\.matchMedia\('\(prefers-color-scheme: dark\)'\)\.matches\);/);
  assert.match(provider, /document\.documentElement\.setAttribute\('data-theme', theme\);/);
  assert.match(provider, /document\.documentElement\.style\.colorScheme = theme;/);
  assert.match(provider, /document\.cookie = themeCookieString\(next\)/);
  // System mode: subscribe to OS changes and follow them live.
  assert.match(provider, /if \(preference !== 'system'\) return;/);
  assert.match(provider, /mq\.addEventListener\('change', onChange\)/);
  assert.match(provider, /mq\.removeEventListener\('change', onChange\)/);
  assert.match(provider, /const effective = resolveTheme\('system', prefersDark\);/);
  // No trace of the old binary API.
  assert.equal(provider.includes('toggleTheme'), false, 'old toggle helper is gone from the provider');
  assert.equal(provider.includes('setTheme'), false, 'old setTheme is gone from the provider');
});

test('theme menu: three options (Dark / Light / Default (system)), active one marked', () => {
  const toggle = read('components/theme/ThemeToggle.tsx');
  assert.match(toggle, /import \{ Check, Monitor, Moon, Sun \} from 'lucide-react'/);
  // All three options, with the right icons and labels.
  assert.match(toggle, /\{ preference: 'dark', label: 'Dark', Icon: Moon \}/);
  assert.match(toggle, /\{ preference: 'light', label: 'Light', Icon: Sun \}/);
  assert.match(toggle, /\{ preference: 'system', label: 'Default \(system\)', Icon: Monitor \}/);
  // Radio-style menu items: the active preference is marked.
  assert.match(toggle, /role="menuitemradio"/);
  assert.match(toggle, /aria-checked=\{isActive\}/);
  assert.match(toggle, /<Check className="w-4 h-4 ml-auto"/);
  assert.match(toggle, /const isActive = preference === option;/);
  // Choosing an option applies it and closes the menu — the end of
  // the flow: menu click -> setPreference -> cookie + data-theme.
  assert.match(toggle, /onClick=\{\(\) => \{ setPreference\(option\); setOpen\(false\); \}\}/);
  assert.match(toggle, /const \{ preference, theme, setPreference \} = useTheme\(\);/);
  // Menu behaviour: button toggles, closes on outside click and on
  // Escape (focus back to the button), arrow keys move between items.
  assert.match(toggle, /aria-haspopup="menu"/);
  assert.match(toggle, /aria-expanded=\{isOpen\}/);
  assert.match(toggle, /aria-label="Theme menu"/);
  assert.match(toggle, /document\.addEventListener\('mousedown', handler\)/);
  assert.match(toggle, /e\.key === 'Escape'/);
  assert.match(toggle, /buttonRef\.current\?\.focus\(\)/);
  assert.match(toggle, /e\.key !== 'ArrowDown' && e\.key !== 'ArrowUp'/);
  // The button shows the CURRENT EFFECTIVE theme's icon (Sun when
  // dark, Moon when light) and its label names the active preference.
  assert.match(toggle, /aria-label=\{label\}/);
  assert.match(toggle, /const label = `Theme: \$\{activeLabel\}`/);
  assert.match(toggle, /useEffect\(\(\) => \{\s*setMounted\(true\);/);
  assert.match(toggle, /mounted \? \(/);
  // No trace of the old binary toggle.
  assert.equal(toggle.includes('toggleTheme'), false, 'old toggle helper is gone from the menu');
  assert.equal(toggle.includes('Switch to light mode'), false, 'old toggle labels are gone');
  assert.equal(toggle.includes('Switch to dark mode'), false, 'old toggle labels are gone');
});

test('toggle is mounted in the public navbar and the portal topbar', () => {
  assert.match(read('components/layout/Navbar.tsx'), /<ThemeToggle \/>/);
  assert.match(read('components/layout/PortalLayout.tsx'), /<ThemeToggle \/>/);
});

test('email templates stay dark-only (out of scope for the theme)', () => {
  const templates = read('lib/email/templates.ts');
  assert.equal(templates.includes('data-theme'), false);
  assert.equal(templates.includes('cb-theme'), false);
  assert.equal(templates.includes('lib/theme'), false);
});

// ---------------------------------------------------------------------------
// Conversion guard — no hardcoded dark-only text colours in owned files
// ---------------------------------------------------------------------------

// Files owned by other Phase 4 workers: the theme conversion does not
// touch them; their hardcoded colours are listed in the worker report
// for reconciliation instead of being edited here.
const OWNED_BY_OTHERS = [
  'components/auth/AuthSocialNav.tsx',
  'components/auth/BrandIcons.tsx',
];
const OWNED_BY_OTHERS_DIRS: string[] = [];

function ownedTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = full.slice(root.length + 1).replace(/\\/g, '/');
    if (statSync(full).isDirectory()) {
      out.push(...ownedTsxFiles(full));
    } else if (entry.endsWith('.tsx')) {
      if (OWNED_BY_OTHERS.includes(rel)) continue;
      if (OWNED_BY_OTHERS_DIRS.some((d) => rel.startsWith(d))) continue;
      out.push(rel);
    }
  }
  return out;
}

// Solid coloured background that stays dark in light mode: white text
// on it is correct in both themes (blue Join button, green badge,
// black View-As button). Tints (bg-green-500/20) do NOT count.
const COLOURED_BG = /bg-black(?:\/\d+)?(?![\w-])|bg-(?:red|green|blue|yellow|amber|orange|pink|purple|cyan|teal|emerald|lime|indigo|violet|fuchsia|rose|sky)-(?:400|500|600|700|800|900)(?![\w/-])/;

test('conversion guard: no bare text-white in owned files except on solid coloured backgrounds', () => {
  const bad: string[] = [];
  for (const rel of ownedTsxFiles(join(root, 'app')).concat(ownedTsxFiles(join(root, 'components')))) {
    const lines = read(rel).split('\n');
    lines.forEach((line, i) => {
      if (!/text-white(?![\w-])/.test(line)) return;
      // CourseCard wishlist heart: white on the black/60 photo circle.
      if (rel === 'components/ui/CourseCard.tsx' && line.includes('fill-primary text-primary')) return;
      if (COLOURED_BG.test(line)) return;
      bad.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(bad, [], 'text-white left on a theme surface (converts to text-foreground)');
});

test('conversion guard: no bare text-primary in owned files except the gold auth panel + photo heart', () => {
  const bad: string[] = [];
  for (const rel of ownedTsxFiles(join(root, 'app')).concat(ownedTsxFiles(join(root, 'components')))) {
    const lines = read(rel).split('\n');
    lines.forEach((line, i) => {
      if (!/text-primary(?![\w-])/.test(line)) return;
      if (/text-primary-text/.test(line)) return;
      // AuthShell gold panel: bright gold on the ink hover bg (panel is
      // gold in both themes, so the dark-gold text token would be wrong).
      if (rel === 'components/auth/AuthShell.tsx' && line.includes('hover:bg-ink hover:text-primary')) return;
      // CourseCard wishlist heart: bright gold on the black/60 circle.
      if (rel === 'components/ui/CourseCard.tsx' && line.includes('fill-primary text-primary')) return;
      bad.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(bad, [], 'text-primary left on a light surface (converts to text-primary-text)');
});

test('conversion guard: no bare text-dark in owned files (ink split)', () => {
  const bad: string[] = [];
  for (const rel of ownedTsxFiles(join(root, 'app')).concat(ownedTsxFiles(join(root, 'components')))) {
    const lines = read(rel).split('\n');
    lines.forEach((line, i) => {
      if (/text-dark(?![\w-])/.test(line) && !/text-ink/.test(line)) {
        bad.push(`${rel}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(bad, [], 'text-dark left (converts to text-ink; --color-dark is a surface token)');
});

test('conversion guard: the new tokens are actually used', () => {
  let primaryText = 0;
  let ink = 0;
  for (const rel of ownedTsxFiles(join(root, 'app')).concat(ownedTsxFiles(join(root, 'components')))) {
    const src = read(rel);
    primaryText += (src.match(/text-primary-text/g) || []).length;
    ink += (src.match(/text-ink/g) || []).length;
  }
  assert.ok(primaryText > 100, `expected many text-primary-text uses, got ${primaryText}`);
  assert.ok(ink > 10, `expected text-ink uses, got ${ink}`);
});
