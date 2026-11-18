/**
 * Website intro & loading experience (Eman, 18 Nov 2026 — "Done bna do").
 *
 * The intro is a ~4s branded splash on the public landing page ONLY,
 * shown once per browser session on the FIRST full page load of "/".
 * It is CodeBettle's own motion (dark + gold, slow and damped) — the
 * "notiune" reaction video was reference only; its squiggle motif and
 * circular reveal are ideas, the execution here is not a copy of the
 * video's motion, colours or branding.
 *
 * FIRST-PAINT MECHANISM (no flicker, no blank screen): the server
 * cannot know sessionStorage, so the pre-hydration inline script
 * (INTRO_SCRIPT, rendered in app/layout.tsx with the CSP nonce, next
 * to THEME_SCRIPT) decides before the first paint. When the intro
 * should show it sets data-cb-intro="show" on <html>; a plain CSS
 * rule in globals.css then paints a fixed dark cover over the page
 * (body::before) so the SSR hero never flashes. The WebsiteIntro
 * component removes that attribute in an effect the moment its
 * animated overlay mounts, so the swap is invisible (the cover
 * stays up until the effect runs — a plain useEffect is enough).
 * fallback in the script drops the cover so the page is never stuck
 * dark. When the intro should NOT show (returning visit,
 * reduced-motion, non-landing page) the script sets nothing and the
 * page paints normally.
 *
 * HERO COORDINATION: the hero stats count up on mount (HeroLoadCounter)
 * and the 3D scene loads lazily — both would finish hidden behind the
 * ~4s overlay. The intro dispatches INTRO_DONE_EVENT when it finishes
 * (or is skipped); the hero listens and starts its count-up and scene
 * fade-in at the reveal. When there is no intro, introAlreadyDone()
 * is true and everything starts at once, exactly as before. A 6s
 * fallback in the listeners starts them anyway if the event is ever
 * missed, so the stats can never stick at 0.
 */

/** sessionStorage key — set the moment the intro finishes or is skipped. */
export const INTRO_SEEN_KEY = 'cb-intro-seen';

/** Window event dispatched when the intro finishes or is skipped. */
export const INTRO_DONE_EVENT = 'cb:intro-done';

/** data attribute the pre-hydration script sets on <html> when the intro will show. */
export const INTRO_DATA_ATTR = 'cb-intro';

/** Fallback (ms) after which the script drops the pre-hydration cover if React never mounted. */
export const INTRO_COVER_FALLBACK_MS = 5000;

/** Fallback (ms) after which hero listeners start anyway if the intro-done event is missed. */
export const INTRO_DONE_FALLBACK_MS = 6000;

/** The tagline typed in Scene 3 — the hero's own subtext, verbatim. */
export const INTRO_TAGLINE =
  'Learn by building real projects, with mentors who review your work — from your first line of code to your first job.';

/** Scene timings (ms). Total is 4000ms — the ~4s cap Eman set.
 * Typing runs at 12ms/char (not the hero typewriter's 80ms — that
 * speed is for 5–16-char role words; a 118-char sentence at 80ms
 * would take ~9.5s). The STYLE is the same (char-by-char + blinking
 * cursor); the speed adapts to the length so the whole sequence
 * still fits in 4s. */
export const INTRO_TYPE_MS_PER_CHAR = 12;
export const INTRO_TYPE_AT_MS = 1400;
export const INTRO_REVEAL_AT_MS = 3500;
export const INTRO_REVEAL_MS = 500;
export const INTRO_TOTAL_MS = 4000;

/** How long the tagline takes to type, from the value above. */
export const INTRO_TYPE_DURATION_MS = INTRO_TAGLINE.length * INTRO_TYPE_MS_PER_CHAR;

/** Deterministic gold particles for Scene 1 (fixed positions — the
 * overlay only renders client-side after mount, but deterministic
 * beats random for tests and for a stable first frame). */
export const INTRO_PARTICLES: { left: number; top: number; size: number; delay: number; drift: number }[] = [
  { left: 8, top: 72, size: 3, delay: 0.0, drift: 56 },
  { left: 16, top: 58, size: 2, delay: 0.08, drift: 72 },
  { left: 24, top: 80, size: 4, delay: 0.16, drift: 48 },
  { left: 31, top: 64, size: 2, delay: 0.05, drift: 66 },
  { left: 38, top: 76, size: 3, delay: 0.22, drift: 52 },
  { left: 45, top: 60, size: 2, delay: 0.12, drift: 78 },
  { left: 52, top: 82, size: 3, delay: 0.28, drift: 44 },
  { left: 60, top: 66, size: 2, delay: 0.18, drift: 62 },
  { left: 67, top: 78, size: 4, delay: 0.03, drift: 50 },
  { left: 73, top: 62, size: 2, delay: 0.24, drift: 70 },
  { left: 80, top: 74, size: 3, delay: 0.1, drift: 58 },
  { left: 86, top: 68, size: 2, delay: 0.3, drift: 64 },
  { left: 91, top: 80, size: 3, delay: 0.14, drift: 46 },
  { left: 95, top: 60, size: 2, delay: 0.2, drift: 68 },
];

/**
 * Pure decision: should the intro play? Every input is passed in so
 * this is unit-testable without a DOM.
 * - seen: the session already watched the intro (sessionStorage flag).
 * - reducedMotion: the user prefers reduced motion — never animate.
 * - pathname: only the landing page ("/") gets the intro.
 * - isEntry: this is a full document load. SPA navigation to "/" sets
 *   no pre-hydration flag, so the intro never replays on internal
 *   route changes even though the component stays mounted in the
 *   root layout across navigations.
 */
export function shouldShowIntro({
  seen,
  reducedMotion,
  pathname,
  isEntry,
}: {
  seen: boolean;
  reducedMotion: boolean;
  pathname: string;
  isEntry: boolean;
}): boolean {
  if (seen) return false;
  if (reducedMotion) return false;
  if (pathname !== '/') return false;
  if (!isEntry) return false;
  return true;
}

/** True when the intro has already been watched this session (safe on the server — returns false there). */
export function hasSeenIntro(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markIntroSeen(): void {
  try {
    window.sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    // Private mode / storage blocked — the intro simply plays again
    // next load rather than breaking anything.
  }
}

/**
 * True when the intro will NOT play on this load, so hero animations
 * may start at once: the session already saw it, or the user prefers
 * reduced motion. On the server this returns true (no intro is ever
 * rendered there) — the client re-checks after hydration.
 */
export function introAlreadyDone(): boolean {
  try {
    if (typeof window === 'undefined') return true;
    if (hasSeenIntro()) return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

/** Tell the hero (and anything else listening) the intro is over. */
export function dispatchIntroDone(): void {
  try {
    window.dispatchEvent(new CustomEvent(INTRO_DONE_EVENT));
  } catch {
    // Non-browser / dispatch blocked — listeners have their own fallback timer.
  }
}

/** Subscribe to the intro-done event; returns an unsubscribe function. */
export function onIntroDone(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener(INTRO_DONE_EVENT, handler);
  return () => window.removeEventListener(INTRO_DONE_EVENT, handler);
}

/**
 * Pre-hydration inline script (mirrors THEME_SCRIPT in lib/theme.ts —
 * same nonce, same position as first child of <body>, runs before the
 * first paint). It mirrors shouldShowIntro() — the two must stay in
 * sync (the test pins the checks). When the intro will show it sets
 * data-cb-intro="show" on <html> (the globals.css cover rule paints
 * the dark cover) and arms the 5s fallback that drops the cover if
 * React never mounts, so a hydration failure can never leave the
 * page stuck dark.
 */
export const INTRO_SCRIPT = `(function(){try{if(location.pathname!=='/')return;if(sessionStorage.getItem('${INTRO_SEEN_KEY}'))return;if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;document.documentElement.setAttribute('data-${INTRO_DATA_ATTR}','show');setTimeout(function(){if(!window.__cbIntroMounted)document.documentElement.removeAttribute('data-${INTRO_DATA_ATTR}');},${INTRO_COVER_FALLBACK_MS});}catch(e){}})();`;
