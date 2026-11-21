/**
 * Theme ink-wipe v2 (Eman, 21 Nov 2026 — EXACT COPY of the Codemure
 * reference video, after he rejected the v1 gold-edge adaptation
 * ("bilkul fazol hay", 10:45 PKT): the new theme spreads as an
 * ORGANIC INK BLOB with smoky/feathery tendril edges from the toggle
 * button, ~1.2s — the video's own black/white ink, NO gold edge, no
 * ring, no glow.
 *
 * Mechanism: the View Transitions API (`document.startViewTransition`).
 * The theme change (data-theme + cookie + React state, all inside the
 * provider's setPreference) runs as the transition's update callback,
 * so the browser snapshots the old theme, applies the new one, and
 * animates between them. The CSS in public/theme-ink-wipe.css
 * reveals `::view-transition-new(root)` through an SVG blob MASK
 * (a turbulence-displaced circle, data-URI in the CSS) that grows
 * from the clicked button. The mask — not a clip-path — carries the
 * edge: v1's clip-path circle was a clean circle (a filter runs
 * BEFORE clip-path, so it cannot wobble a clip edge — proven 21
 * Nov), which is why v1 looked like a plain circle with a gold
 * outline instead of the video's tendril blob. The mask's edge is
 * the displaced circle itself, so the tendrils are the reveal edge.
 * The snapshot carries NO filter: the revealed content stays sharp
 * inside the blob, exactly like the video.
 *
 * The ink IS the incoming theme's surface (the snapshot is the new
 * theme's rendered page): black ink spreading reveals the dark
 * theme, white ink reveals the light theme — same motion both
 * directions, from whichever control was tapped.
 *
 * Behaviour guards (brief):
 *  - No View Transitions support (older browsers) -> instant switch.
 *  - prefers-reduced-motion -> instant switch, no wipe.
 *  - The theme itself is unchanged: same cookie-persisted preference,
 *    same effective-theme resolution — this only wraps the switch.
 *  - A second tap mid-wipe starts a fresh wipe; the older wipe's
 *    cleanup stands down (token guard) so it never removes the new
 *    wipe's variables early.
 *
 * Pure helpers (wipeRadius / shouldWipe / elementCenter) are unit-
 * tested in tests/theme-ink-wipe.test.ts; the wiring (both theme
 * controls call applyThemeWithWipe, the mask, the sync constants)
 * is asserted there too.
 */

/** How long the wipe runs (must match the animation in theme-ink-wipe.css). */
export const THEME_WIPE_DURATION_MS = 1200;

/** The wipe's ease (must match the keyframes in theme-ink-wipe.css).
 * Near-linear with a soft landing — the video's blob spreads
 * steadily (about half the page at half the time), NOT the v1
 * slow-out ease, which front-loaded the growth so hard the blob
 * covered the whole viewport in ~200ms and the rest was invisible. */
export const THEME_WIPE_EASE = 'cubic-bezier(0.33, 0.66, 0.66, 1)';

/** A point on the page (viewport coordinates), e.g. a button centre. */
export interface WipeOrigin {
  x: number;
  y: number;
}

/**
 * Radius of the circle that, centred on (x, y), covers the whole
 * viewport: the distance to the farthest corner. The mask in
 * theme-ink-wipe.css animates from 0 to this radius (plus an
 * overshoot for the displacement — see the CSS), so the wipe always
 * reaches every corner no matter where the button sits.
 */
export function wipeRadius(x: number, y: number, width: number, height: number): number {
  return Math.max(
    Math.hypot(x, y),
    Math.hypot(width - x, y),
    Math.hypot(x, height - y),
    Math.hypot(width - x, height - y),
  );
}

/** Whether a wipe may run at all in this environment. */
export function shouldWipe(options: { hasViewTransition: boolean; prefersReducedMotion: boolean }): boolean {
  return options.hasViewTransition && !options.prefersReducedMotion;
}

/** Centre of an element's on-screen box (viewport coordinates). */
export function elementCenter(element: { getBoundingClientRect: () => { left: number; top: number; width: number; height: number } }): WipeOrigin {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** The newest wipe wins; older wipes' cleanups stand down. */
let wipeToken = 0;

/**
 * Run a theme change with the ink wipe when possible, instantly
 * otherwise. `update` is the actual theme switch (the provider's
 * setPreference call). The origin is the clicked button's centre —
 * the wipe spreads from whichever control was tapped (navbar
 * ThemeToggle menu item or avatar-dropdown ThemeMenuRow icon).
 */
export function applyThemeWithWipe(update: () => void, origin: WipeOrigin): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    update();
    return;
  }
  const hasViewTransition = 'startViewTransition' in document;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!shouldWipe({ hasViewTransition, prefersReducedMotion })) {
    update();
    return;
  }
  const token = ++wipeToken;
  const root = document.documentElement;
  const radius = wipeRadius(origin.x, origin.y, window.innerWidth, window.innerHeight);
  root.style.setProperty('--wipe-x', `${origin.x}px`);
  root.style.setProperty('--wipe-y', `${origin.y}px`);
  root.style.setProperty('--wipe-r', `${radius}px`);
  const transition = document.startViewTransition(update);
  // `finished` rejects when the transition is skipped — both paths
  // clean up. A second tap mid-wipe bumps the token, so this wipe's
  // cleanup never removes the new wipe's variables early.
  const cleanup = () => {
    if (token !== wipeToken) return;
    root.style.removeProperty('--wipe-x');
    root.style.removeProperty('--wipe-y');
    root.style.removeProperty('--wipe-r');
  };
  transition.finished.then(cleanup, cleanup);
}
