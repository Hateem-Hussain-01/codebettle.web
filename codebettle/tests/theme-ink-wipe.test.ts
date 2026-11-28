// Theme ink-wipe v2 (Eman, 21 Nov 2026 — EXACT COPY of the Codemure
// reference video, after he rejected the v1 gold-edge adaptation
// ("bilkul fazol hay", 10:45 PKT): the new theme spreads as an organic
// ink blob with smoky/feathery tendril edges from the toggle button,
// ~2s (slowed from the video's ~1.2s on Eman's order, 28 Nov 2026) — the video's own black/white ink, NO gold edge, no ring, no
// glow.
//
// These tests pin the pure helpers (unit) and the wiring
// (source-level, like the other guard tests). They do not render
// pixels — visual verification against a rendered repro page is in
// the PR body. The video's bottom-left settings/sliders panel is the
// creator's dev panel and is NOT part of the feature — nothing here
// builds it.
//
// v1 lesson pinned here: a filter runs BEFORE clip-path, so a clip
// edge can never be wobbled — v1's blob was a clean circle with a
// gold outline. v2 reveals through an SVG blob MASK (the displaced
// circle IS the edge), so the tests forbid clip-path, the gold ring,
// the popover, and the #ink-blob filter — all of which are gone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { elementCenter, shouldWipe, wipeRadius, THEME_WIPE_DURATION_MS, THEME_WIPE_EASE } from '../lib/theme-wipe';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

// ---------------------------------------------------------------------------
// Pure helpers (unit)
// ---------------------------------------------------------------------------

test('wipeRadius: centre of the viewport reaches the corners', () => {
  // 100x100 viewport, origin at the centre: farthest corner is ~70.71.
  assert.ok(Math.abs(wipeRadius(50, 50, 100, 100) - Math.hypot(50, 50)) < 0.001);
});

test('wipeRadius: a corner origin must reach the opposite corner', () => {
  // Top-left origin on a 100x100 viewport: the far corner is ~141.42.
  assert.ok(Math.abs(wipeRadius(0, 0, 100, 100) - Math.hypot(100, 100)) < 0.001);
  // Top-right origin on a wide viewport: the farthest corner is bottom-left.
  assert.ok(Math.abs(wipeRadius(800, 0, 800, 600) - Math.hypot(800, 600)) < 0.001);
});

test('wipeRadius: the wipe always covers the whole viewport', () => {
  // Whatever the origin, the radius must reach all four corners.
  for (const [x, y] of [[0, 0], [400, 300], [799, 599], [123, 456]] as const) {
    const r = wipeRadius(x, y, 800, 600);
    for (const [cx, cy] of [[0, 0], [800, 0], [0, 600], [800, 600]] as const) {
      assert.ok(r >= Math.hypot(x - cx, y - cy), `radius ${r} must reach corner (${cx}, ${cy}) from (${x}, ${y})`);
    }
  }
});

test('shouldWipe: only with View Transitions support and no reduced motion', () => {
  assert.equal(shouldWipe({ hasViewTransition: true, prefersReducedMotion: false }), true);
  assert.equal(shouldWipe({ hasViewTransition: false, prefersReducedMotion: false }), false, 'no support = instant switch');
  assert.equal(shouldWipe({ hasViewTransition: true, prefersReducedMotion: true }), false, 'reduced motion = instant switch');
  assert.equal(shouldWipe({ hasViewTransition: false, prefersReducedMotion: true }), false);
});

test('elementCenter: centre of the clicked element (works for keyboard activation too)', () => {
  const el = { getBoundingClientRect: () => ({ left: 100, top: 50, width: 40, height: 40 }) };
  assert.deepEqual(elementCenter(el), { x: 120, y: 70 });
});

test('wipe duration is 2s (Eman, 28 Nov 2026: slower than the video\u2019s 1.2s)', () => {
  assert.equal(THEME_WIPE_DURATION_MS, 2000, `duration must be 2s, got ${THEME_WIPE_DURATION_MS}ms`);
  assert.equal(THEME_WIPE_EASE, 'cubic-bezier(0.33, 0.66, 0.66, 1)', 'the mask must use the steady-spread ease (v1 slow-out covered the viewport in ~200ms)');
  const css = read('public/theme-ink-wipe.css');
  assert.ok(css.includes('animation: theme-ink-wipe 2s'), 'the CSS animation must run the same 2s');
  assert.ok(!css.includes('theme-ink-wipe 0.9s'), 'v1 ran 0.9s — v2 is the video timing, slowed to 2s');
});

// ---------------------------------------------------------------------------
// Wiring (source-level)
// ---------------------------------------------------------------------------

test('theme-wipe helper: view transition with instant fallback + stale-var cleanup, no ring', () => {
  const src = read('lib/theme-wipe.ts');
  assert.ok(src.includes('document.startViewTransition(update)'), 'the theme switch must run inside startViewTransition');
  assert.ok(src.includes("matchMedia('(prefers-reduced-motion: reduce)')"), 'reduced motion must skip the wipe');
  assert.ok(src.includes('--wipe-x') && src.includes('--wipe-y') && src.includes('--wipe-r'), 'the origin + radius must reach the CSS as variables');
  assert.ok(src.includes('removeProperty'), 'the CSS variables must be cleaned up after the transition');
  assert.ok(src.includes('wipeToken'), 'a second tap mid-wipe must not let the older wipe remove the new wipe variables early');
  assert.ok(!src.includes('showPopover') && !src.includes('hidePopover'), 'v2 has no gold ring popover (Eman rejected it) — no popover code');
  assert.ok(!src.includes('ring.animate') && !src.includes('getRingElements'), 'v2 has no ring to animate');
  assert.ok(src.includes('THEME_WIPE_DURATION_MS = 2000'), 'the duration constant must be 2s');
});

test('theme-ink-wipe.css: ink-wipe keyframes — SVG blob MASK, no clip-path, no gold', () => {
  // The wipe CSS lives in public/theme-ink-wipe.css (plain file,
  // served raw) — Tailwind v4's CSS pipeline drops
  // ::view-transition-* rules, so they must NOT live in globals.css
  // (21 Nov 2026: the wipe silently fell back to the browser's
  // default 0.25s fade while the block was there). The selectors use
  // the CURRENT functional syntax ::view-transition-old(root) /
  // ::view-transition-new(root) — the old -root form was removed from
  // Chromium and fails to parse (CSS.supports false, insertRule
  // throws); never "fix" them back.
  const css = read('public/theme-ink-wipe.css');
  assert.ok(css.includes('::view-transition-new(root)'), 'the new theme snapshot must be animated');
  assert.ok(css.includes('::view-transition-old(root)'), 'the old snapshot must be pinned (no fade)');
  assert.ok(!css.includes('::view-transition-new-root') && !css.includes('::view-transition-old-root'), 'the removed -root selector form must not come back');
  assert.ok(css.includes('@keyframes theme-ink-wipe'), 'the wipe keyframes must exist');
  assert.ok(css.includes('mask-image:'), 'the wipe must reveal through a mask (the mask IS the edge)');
  assert.ok(css.includes('data:image/svg+xml'), 'the mask must be an inline SVG blob');
  assert.ok(css.includes('feTurbulence'), 'the blob mask must use fractal noise for the tendril edge');
  assert.ok(css.includes('feDisplacementMap'), 'the blob mask must displace the circle with the noise');
  assert.ok(css.includes("scale='120'"), 'the blob mask must displace hard (scale 120) — scale 45 gave a tame wobbly circle (21 Nov)');
  assert.ok(css.includes('* 4.6'), 'the mask must overshoot to 4.6x the covering radius (min edge reach 1.03x with scale 120 — see the CSS overshoot note)');
  assert.ok(css.includes('* 2.3'), 'the mask must stay centred on the clicked button at the overshoot size');
  assert.ok(css.includes('mask-position:'), 'the mask must stay centred on the clicked button (mask-position)');
  assert.ok(css.includes('mask-repeat: no-repeat'), 'the mask must not tile');
  assert.ok(!css.includes('clip-path'), 'v1 clip-path is GONE — a filter runs before clip-path, so a clip edge can never be wobbled (proven 21 Nov)');
  assert.ok(!css.includes('url(#ink-blob)'), 'the v1 displacement filter is GONE — the mask carries the edge now');
  assert.ok(!css.includes('drop-shadow'), 'a shadow filter does NOT paint on view-transition snapshots in Chromium (proven 21 Nov)');
  assert.ok(!css.includes('.theme-wipe-ring'), 'the gold ring is GONE (Eman rejected it)');
  assert.ok(!css.includes('var(--color-primary)'), 'no gold anywhere in the wipe — the ink is the incoming theme surface itself');
  assert.ok(!css.includes('theme-ink-wipe 1.5s') && !css.includes('theme-ink-wipe 0.25s'), 'the wipe must not copy the video 1.5s or the UA 0.25s default');
  assert.ok(css.includes('cubic-bezier(0.33, 0.66, 0.66, 1)'), 'the wipe must use the steady-spread ease');
});

test('globals.css must NOT hold view-transition rules (the pipeline drops them)', () => {
  const css = read('app/globals.css');
  assert.ok(!css.includes('::view-transition-new(root)') && !css.includes('::view-transition-new-root'), 'view-transition rules in globals.css are dropped by Tailwind — they belong in public/theme-ink-wipe.css');
  assert.ok(!css.includes('::view-transition-old(root)') && !css.includes('::view-transition-old-root'), 'view-transition rules in globals.css are dropped by Tailwind — they belong in public/theme-ink-wipe.css');
  assert.ok(!css.includes('@keyframes theme-ink-wipe'), 'the wipe keyframes belong with the rules in public/theme-ink-wipe.css');
});

test('root layout loads the plain wipe stylesheet and carries NO ink-blob filter', () => {
  const layout = read('app/layout.tsx');
  assert.ok(layout.includes('href="/theme-ink-wipe.css"'), 'the root layout must load the plain wipe stylesheet (same-origin, allowed by style-src self)');
  assert.ok(!layout.includes('id="ink-blob"'), 'the v1 displacement filter is GONE — the mask is a data-URI in the CSS, nothing in the DOM');
  assert.ok(!layout.includes('feTurbulence') && !layout.includes('feDisplacementMap'), 'no SVG filter defs remain in the layout');
});

test('ThemeToggle: picking a theme wipes from the clicked menu item and closes the menu', () => {
  const src = read('components/theme/ThemeToggle.tsx');
  assert.ok(src.includes('applyThemeWithWipe'), 'ThemeToggle must switch themes through the wipe helper');
  assert.ok(src.includes('elementCenter(e.currentTarget)'), 'the wipe must originate at the clicked menu item');
  assert.ok(src.includes('setPreference(option); setOpen(false);'), 'the menu must close as part of the same transition');
});

test('ThemeMenuRow: picking a theme wipes from the clicked icon, menu stays open', () => {
  const src = read('components/theme/ThemeMenuRow.tsx');
  assert.ok(src.includes('applyThemeWithWipe'), 'ThemeMenuRow must switch themes through the wipe helper');
  assert.ok(src.includes('elementCenter(e.currentTarget)'), 'the wipe must originate at the clicked icon');
  assert.ok(!src.includes('setOpen(false)'), 'picking a theme must NOT close the avatar menu (user sees the change, can pick another)');
});

test('theme behaviour unchanged: cookie + data-theme still set by the provider', () => {
  const provider = read('components/theme/ThemeProvider.tsx');
  assert.ok(provider.includes('themeCookieString(next)'), 'the preference must still persist in the cb-theme cookie');
  assert.ok(provider.includes("setAttribute('data-theme', theme)"), 'the effective theme must still land on <html>');
  assert.ok(provider.includes("resolveTheme('system'"), 'system preference must still follow the device');
});
