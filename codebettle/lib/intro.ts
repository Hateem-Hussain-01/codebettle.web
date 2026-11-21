/**
 * Website intro (Eman, 21 Nov 2026 — "EXACT COPY NA KRO, WO EXACT
 * VIDEO HE LAGA DO WAHA PAY").
 *
 * The intro is the EXACT video file he sent (the CodeBettle logo
 * intro, 9.7s, 1920x1080 — tunnel + bee logo) — served as-is from
 * public/intro-video.mp4. No rebuild, no re-animation, no trim, no
 * re-edit: the previous animated intro (bee + letters + tagline,
 * ~6s, PRs #79/#85) is replaced wholesale by the video element.
 * (The notiune reference recording was a misread — it is NOT the
 * intro and must not be embedded.)
 *
 * Behaviour (same contract as the old intro, only the content
 * changed): the intro plays on the public landing page ONLY, once
 * per browser session on the FIRST full page load of "/". The video
 * autoplays MUTED (browsers block sound autoplay) and is skippable
 * by tap/click anywhere, by the Skip button, or by Escape; it also
 * ends on its own when the video finishes (onEnded), and if the
 * file fails to load it dismisses at once instead of stranding the
 * page. Reduced motion skips the video entirely. It never blocks
 * auth, routing or dashboards — the intro mounts in the root
 * layout but plays only on "/" and only in a fresh session.
 *
 * FIRST-PAINT MECHANISM (no flicker, no blank screen): the server
 * cannot know sessionStorage, so the pre-hydration inline script
 * (INTRO_SCRIPT, rendered in app/layout.tsx with the CSP nonce, next
 * to THEME_SCRIPT) decides before the first paint. When the intro
 * should show it sets data-cb-intro="show" on <html>; a plain CSS
 * rule in globals.css then paints a fixed dark cover over the page
 * (body::before) so the SSR hero never flashes. The WebsiteIntro
 * component removes that attribute in an effect the moment its
 * overlay mounts, so the swap is invisible (the cover stays up
 * until the effect runs — a plain useEffect is enough). The script's
 * fallback drops the cover after 10s if React never mounts, so a
 * hydration failure can never leave the page stuck dark.
 *
 * HERO COORDINATION: the 3D scene fades in when the intro is over.
 * The intro dispatches INTRO_DONE_EVENT when it finishes (or is
 * skipped); the hero listens and starts its scene fade-in at the
 * end. When there is no intro, introAlreadyDone() is true and
 * everything starts at once, exactly as before. A 12s fallback in
 * the listener starts it anyway if the event is ever missed — it
 * must exceed the video (9.7s) so it never fires mid-video and lets
 * the scene fade in hidden behind the overlay.
 */

/** sessionStorage key — set the moment the intro finishes or is skipped. */
export const INTRO_SEEN_KEY = 'cb-intro-seen';

/** Window event dispatched when the intro finishes or is skipped. */
export const INTRO_DONE_EVENT = 'cb:intro-done';

/** data attribute the pre-hydration script sets on <html> when the intro will show. */
export const INTRO_DATA_ATTR = 'cb-intro';

/** The exact video file, served as-is from public/ (Eman, 21 Nov
 * 2026). Byte-identical to the reference he sent — never re-encoded. */
export const INTRO_VIDEO_SRC = '/intro-video.mp4';

/** Nominal length of the video (ms) — the file is 9.72s. Used
 * only to size the hero-done fallback below; the video itself ends
 * on its own onEnded, so the intro never depends on this clock. */
export const INTRO_VIDEO_DURATION_MS = 9700;

/** Fallback (ms) after which the script drops the pre-hydration cover if React never mounted.
 * 10s: on a slow phone hydration can take longer than 5s, and the old fallback removed the flag before
 * the component could read it — the intro then never played on mobile at all. The component also falls back to the session flag
 * directly (see WebsiteIntro), so this is belt-and-braces. */
export const INTRO_COVER_FALLBACK_MS = 10000;

/** Fallback (ms) after which hero listeners start anyway if the intro-done event is missed.
 * Must exceed the video (9.7s) — 12s leaves a 2.3s margin — so it never fires mid-video. */
export const INTRO_DONE_FALLBACK_MS = 12000;

/**
 * Pure decision: should the intro play? Every input is passed in so
 * this is unit-testable without a DOM.
 * - seen: the session already watched the intro (sessionStorage flag).
 * - reducedMotion: the user prefers reduced motion — never play the video.
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
 * the dark cover) and arms the 10s fallback that drops the cover if
 * React never mounts, so a hydration failure can never leave the
 * page stuck dark.
 */
export const INTRO_SCRIPT = `(function(){try{if(location.pathname!=='/')return;if(sessionStorage.getItem('${INTRO_SEEN_KEY}'))return;if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;document.documentElement.setAttribute('data-${INTRO_DATA_ATTR}','show');setTimeout(function(){if(!window.__cbIntroMounted)document.documentElement.removeAttribute('data-${INTRO_DATA_ATTR}');},${INTRO_COVER_FALLBACK_MS});}catch(e){}})();`;
