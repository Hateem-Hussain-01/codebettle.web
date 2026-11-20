// Theme ink-wipe (Eman, 21 Nov 2026 — reference video of an organic
// ink-blob theme transition, adapted to CodeBettle: the wipe uses the
// incoming theme's surface with a thin GOLD edge/glow on the spreading
// front, never the video's plain black/white ink).
//
// These tests pin the pure helpers (unit) and the wiring
// (source-level, like the other guard tests). They do not render
// pixels — visual verification against a rendered repro page is in
// the PR body. The video's bottom-left settings/sliders panel is the
// creator's dev panel and is NOT part of the feature — nothing here
// builds it.
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

test('wipe duration is ~0.9s (the brief: 0.8-1s, slow/damped)', () => {
  assert.ok(THEME_WIPE_DURATION_MS >= 800 && THEME_WIPE_DURATION_MS <= 1000, `duration must be 0.8-1s, got ${THEME_WIPE_DURATION_MS}ms`);
  assert.equal(THEME_WIPE_EASE, 'cubic-bezier(0.16, 1, 0.3, 1)', 'the ring must share the clip easing');
  const css = read('public/theme-ink-wipe.css');
  assert.ok(css.includes(`animation: theme-ink-wipe 0.9s`), 'the CSS animation must run the same 0.9s');
});

// ---------------------------------------------------------------------------
// Wiring (source-level)
// ---------------------------------------------------------------------------

test('theme-wipe helper: view transition with instant fallback + stale-var cleanup', () => {
  const src = read('lib/theme-wipe.ts');
  assert.ok(src.includes('document.startViewTransition(update)'), 'the theme switch must run inside startViewTransition');
  assert.ok(src.includes("matchMedia('(prefers-reduced-motion: reduce)')"), 'reduced motion must skip the wipe');
  assert.ok(src.includes('--wipe-x') && src.includes('--wipe-y') && src.includes('--wipe-r'), 'the origin + radius must reach the CSS as variables');
  assert.ok(src.includes('removeProperty'), 'the CSS variables must be cleaned up after the transition');
});

test('theme-ink-wipe.css: ink-wipe keyframes — clip-path circle + organic filter + gold edge', () => {
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
  assert.ok(css.includes('clip-path: circle(0px at var(--wipe-x'), 'the wipe must start as a point at the clicked button');
  assert.ok(css.includes('clip-path: circle(var(--wipe-r'), 'the wipe must expand to the farthest-corner radius');
  assert.ok(css.includes('url(#ink-blob)'), 'the spreading edge must be wobbled into an organic shape by the SVG displacement filter');
  assert.ok(!css.includes('drop-shadow'), 'a shadow filter does NOT paint on view-transition snapshots in Chromium (proven 21 Nov) — the gold edge lives in the popover ring, never as a shadow filter');
  assert.ok(!css.includes('theme-ink-wipe 1.5s') && !css.includes('theme-ink-wipe 0.25s'), 'the wipe must not copy the video 1.5s or the UA 0.25s default');
  assert.ok(css.includes('cubic-bezier(0.16, 1, 0.3, 1)'), 'the wipe must use the slow/damped ease');
});

test('theme-ink-wipe.css: the gold ring is a popover ring (above the view-transition layer)', () => {
  // The view-transition snapshots paint in the top layer above all
  // normal DOM, so a plain overlay would be hidden behind them — the
  // gold ring MUST live in a manual popover shown after the transition
  // starts (proven 21 Nov: a plain overlay ring was invisible, the
  // popover ring traced the spreading edge).
  const css = read('public/theme-ink-wipe.css');
  assert.ok(css.includes('.theme-wipe-ring-popover'), 'the popover that carries the ring must exist');
  assert.ok(css.includes('popover'), 'the ring holder must be a popover');
  assert.ok(css.includes('background: transparent'), 'the popover must not dim the page');
  assert.ok(css.includes('.theme-wipe-ring-popover::backdrop'), 'the popover backdrop must be transparent');
  assert.ok(css.includes('.theme-wipe-ring'), 'the ring itself must exist');
  assert.ok(css.includes('border: 4px solid var(--color-primary)'), 'the ring must be CodeBettle gold (never the video plain black/white ink)');
  assert.ok(css.includes('box-shadow: 0 0 16px 4px'), 'the ring must carry a gold glow');
  assert.ok(css.includes('pointer-events: none'), 'the ring must never block clicks');
});

test('globals.css must NOT hold view-transition rules (the pipeline drops them)', () => {
  const css = read('app/globals.css');
  assert.ok(!css.includes('::view-transition-new(root)') && !css.includes('::view-transition-new-root'), 'view-transition rules in globals.css are dropped by Tailwind — they belong in public/theme-ink-wipe.css');
  assert.ok(!css.includes('::view-transition-old(root)') && !css.includes('::view-transition-old-root'), 'view-transition rules in globals.css are dropped by Tailwind — they belong in public/theme-ink-wipe.css');
  assert.ok(!css.includes('@keyframes theme-ink-wipe'), 'the wipe keyframes belong with the rules in public/theme-ink-wipe.css');
});

test('root layout loads the plain wipe stylesheet', () => {
  const layout = read('app/layout.tsx');
  assert.ok(layout.includes('href="/theme-ink-wipe.css"'), 'the root layout must load the plain wipe stylesheet (same-origin, allowed by style-src self)');
});

test('root layout: the ink-blob SVG displacement filter exists (displacement only)', () => {
  // Displacement ONLY — no flood/composite ring: filters run BEFORE
  // clip-path, so anything the filter paints outside the clip is cut
  // away and a filter-based gold ring cannot work (proven 21 Nov).
  // The gold edge lives in the popover ring, not in this filter.
  const layout = read('app/layout.tsx');
  assert.ok(layout.includes('id="ink-blob"'), 'the filter the CSS references must exist in the DOM');
  assert.ok(layout.includes('feTurbulence'), 'the filter must use fractal noise for the liquid edge');
  assert.ok(layout.includes('feDisplacementMap'), 'the filter must displace the edge with the noise');
  assert.ok(!layout.includes('feMorphology') && !layout.includes('feFlood'), 'no filter-based gold ring — it cannot paint past the clip');
  assert.ok(layout.includes('aria-hidden="true"'), 'the filter SVG must be hidden from assistive tech');
});

test('theme-wipe helper: the ring is a popover animated in lock-step with the clip', () => {
  const src = read('lib/theme-wipe.ts');
  assert.ok(src.includes('showPopover'), 'the ring must be shown as a popover (above the view-transition layer)');
  assert.ok(src.includes('hidePopover'), 'the popover must be hidden when the wipe settles');
  assert.ok(src.includes("transition.ready.then"), 'the ring must start when the transition is ready (same moment as the clip animation)');
  assert.ok(src.includes('ring.animate'), 'the ring must be animated with the Web Animations API');
  assert.ok(src.includes('THEME_WIPE_DURATION_MS') && src.includes('THEME_WIPE_EASE'), 'the ring must share the clip duration and ease');
  assert.ok(src.includes('wipeToken'), 'a second tap mid-wipe must not let the older wipe hide the new ring');
  assert.ok(src.includes("setAttribute('popover', 'manual')"), 'the popover must be manual (no light-dismiss, no backdrop dim)');
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
