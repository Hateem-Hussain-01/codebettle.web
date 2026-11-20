/**
 * Theme ink-wipe (Eman, 21 Nov 2026 — reference video of an organic
 * ink-blob theme transition, adapted to CodeBettle: the wipe uses the
 * incoming theme's surface with a thin GOLD edge/glow on the spreading
 * front, never the video's plain black/white ink).
 *
 * Mechanism: the View Transitions API (`document.startViewTransition`).
 * The theme change (data-theme + cookie + React state, all inside the
 * provider's setPreference) runs as the transition's update callback,
 * so the browser snapshots the old theme, applies the new one, and
 * animates between them. The CSS in public/theme-ink-wipe.css animates
 * `::view-transition-new(root)` with a clip-path circle expanding from
 * the clicked button. The same SVG displacement filter (#ink-blob,
 * defined in the root layout) wobbles the page content just inside the
 * spreading edge, for the liquid feel.
 *
 * The GOLD edge is a separate gold ring in a manual popover, animated
 * in lock-step with the clip circle (same origin, radius, duration and
 * ease). It has to live in a popover: the view-transition snapshots
 * paint in the top layer above all normal DOM, so a plain overlay
 * would be hidden behind them — a popover shown after the transition
 * starts stacks above that layer (proven 21 Nov). The ring itself is
 * a bordered circle with a gold glow, wobbled into an organic shape by
 * the same #ink-blob displacement filter. A CSS drop-shadow() on the
 * snapshot does NOT paint in Chromium, and an SVG flood/composite
 * ring inside the filter cannot work either (filters run BEFORE
 * clip-path, so anything painted outside the clip is cut away) — the
 * popover ring is the mechanism that actually paints. Never re-add a
 * drop-shadow or a filter-based ring.
 *
 * Behaviour guards (brief):
 *  - No View Transitions support (older browsers) -> instant switch.
 *  - prefers-reduced-motion -> instant switch, no wipe, no ring.
 *  - No popover support -> the wipe still runs, just without the ring.
 *  - The theme itself is unchanged: same cookie-persisted preference,
 *    same effective-theme resolution — this only wraps the switch.
 *  - A second tap mid-wipe starts a fresh wipe; the older wipe's
 *    cleanup stands down (token guard) so it never hides the new ring.
 *
 * Pure helpers (wipeRadius / shouldWipe / elementCenter) are unit-
 * tested in tests/theme-ink-wipe.test.ts; the wiring (both theme
 * controls call applyThemeWithWipe, the popover ring, the sync
 * constants) is asserted there too.
 */

/** How long the wipe runs (must match the animation in theme-ink-wipe.css). */
export const THEME_WIPE_DURATION_MS = 900;

/** The wipe's ease (must match the keyframes in theme-ink-wipe.css). */
export const THEME_WIPE_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

/** A point on the page (viewport coordinates), e.g. a button centre. */
export interface WipeOrigin {
  x: number;
  y: number;
}

/**
 * Radius of the circle that, centred on (x, y), covers the whole
 * viewport: the distance to the farthest corner. The clip-path in
 * theme-ink-wipe.css animates from 0 to this radius, so the wipe always
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

// ---------------------------------------------------------------------------
// Gold ring (manual popover, above the view-transition layer)
// ---------------------------------------------------------------------------

const RING_POPOVER_ID = 'theme-wipe-ring-popover';
const RING_ID = 'theme-wipe-ring';

/** The newest wipe wins; older wipes' cleanups stand down. */
let wipeToken = 0;

function canShowRing(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof HTMLElement !== 'undefined' &&
    'showPopover' in HTMLElement.prototype
  );
}

function getRingElements(): { popover: HTMLElement; ring: HTMLElement } | null {
  if (typeof document === 'undefined') return null;
  let popover = document.getElementById(RING_POPOVER_ID);
  let ring = popover?.querySelector<HTMLElement>(`#${RING_ID}`) ?? null;
  if (!popover || !ring) {
    popover = document.createElement('div');
    popover.id = RING_POPOVER_ID;
    popover.className = 'theme-wipe-ring-popover';
    popover.setAttribute('popover', 'manual');
    popover.setAttribute('aria-hidden', 'true');
    ring = document.createElement('div');
    ring.id = RING_ID;
    ring.className = 'theme-wipe-ring';
    popover.appendChild(ring);
    document.body.appendChild(popover);
  }
  return { popover: popover as HTMLElement, ring: ring as HTMLElement };
}

function hideRing(popover: HTMLElement, ring: HTMLElement): void {
  ring.getAnimations().forEach((animation) => animation.cancel());
  if (popover.matches(':popover-open')) popover.hidePopover();
}

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
  const elements = canShowRing() ? getRingElements() : null;
  // The ring starts when the transition is ready to animate — the
  // clip-path animation starts at the same moment, so the ring and
  // the spreading edge stay in lock-step (same origin, radius,
  // duration and ease). `finished` rejects when the transition is
  // skipped — both paths clean up.
  const cleanup = () => {
    if (token !== wipeToken) return;
    if (elements) hideRing(elements.popover, elements.ring);
    root.style.removeProperty('--wipe-x');
    root.style.removeProperty('--wipe-y');
    root.style.removeProperty('--wipe-r');
  };
  if (elements) {
    const { popover, ring } = elements;
    ring.style.left = `${origin.x}px`;
    ring.style.top = `${origin.y}px`;
    ring.style.width = `${radius * 2}px`;
    ring.style.height = `${radius * 2}px`;
    transition.ready.then(
      () => {
        if (token !== wipeToken) return;
        if (!popover.matches(':popover-open')) popover.showPopover();
        ring.animate(
          [{ transform: 'translate(-50%, -50%) scale(0)' }, { transform: 'translate(-50%, -50%) scale(1)' }],
          { duration: THEME_WIPE_DURATION_MS, easing: THEME_WIPE_EASE, fill: 'forwards' },
        );
      },
      () => {},
    );
  }
  transition.finished.then(cleanup, cleanup);
}
