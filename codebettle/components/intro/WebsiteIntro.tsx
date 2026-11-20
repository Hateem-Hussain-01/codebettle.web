'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import images from '@/lib/certificates/assets/images.json';
import {
  INTRO_DATA_ATTR,
  INTRO_PARTICLES,
  INTRO_REVEAL_AT_MS,
  INTRO_REVEAL_MS,
  INTRO_TAGLINE,
  INTRO_TYPE_AT_MS,
  INTRO_TYPE_DURATION_MS,
  INTRO_TYPE_MS_PER_CHAR,
  dispatchIntroDone,
  hasSeenIntro,
  markIntroSeen,
} from '@/lib/intro';

/**
 * Website intro & loading experience (Eman, 18 Nov 2026 — "Done bna do").
 *
 * A ~6s branded splash on the landing page ONLY, once per browser
 * session on the first full load of "/". (Retuned 20 Nov 2026, Eman:
 * the ~4s version felt rushed — slower, more damped motion
 * throughout, total ~6s.) CodeBettle's own motion (dark + gold, slow
 * and damped — FadeIn's 0.45s ease-out house timing, the hero's 1.8s
 * count-up character): the "notiune" video was reference only;
 * nothing here copies its motion, colours or branding. Scenes, all
 * on the dark background:
 *   1. (0–0.9s) gold particles fade in and drift upward slowly; logo glows.
 *   2. (0.8–2.0s) the real bee mark scales in on a soft spring with
 *      a gold glow; "CODEBETTLE" letters rise one by one from 1.0s
 *      (clean premium rise — NOT the video's scattered falling
 *      letters), 0.7s each with a 0.08s stagger.
 *   3. (2.2–~4.6s) the tagline types in char-by-char with the
 *      blinking cursor, in the hero typewriter's style (20ms/char
 *      for a 118-char sentence, where the hero's 80ms suits 5–16-char
 *      role words); a gold underline draws left → right under it as
 *      typing finishes.
 *   4. (4.6–5.2s) a thin gold wavy line draws across (the video's
 *      squiggle motif, reimagined in gold); gold rings ripple out
 *      behind the logo.
 *   5. (5.2–6.0s) a gold-ringed circle expands from the centre and
 *      wipes the intro away — a circular reveal, not a plain fade:
 *      the dark overlay's clip-path circle collapses to the centre
 *      while a gold ring scales outward, revealing the hero beneath.
 *   6. (6.0s+) hero settles; the hero count-up and 3D fade-in start
 *      via the intro-done event (see lib/intro.ts).
 *
 * SESSION-SCOPING: the pre-hydration script (lib/intro.ts,
 * INTRO_SCRIPT) sets data-cb-intro="show" on <html> only on a full
 * document load of "/" in a session that has not seen the intro and
 * does not prefer reduced motion. This component plays ONLY when
 * that flag is present — SPA navigation to "/" sets no flag, so the
 * intro never replays on internal route changes, and the root layout
 * keeps this component mounted across navigations.
 *
 * FIRST PAINT: the flag also drives the globals.css cover rule
 * (body::before, dark, z-9999) so the SSR hero never flashes. This
 * component removes the flag in a layout effect the moment its
 * animated overlay mounts (same commit, before paint) — the swap
 * is invisible. The overlay itself is z-10000, above the cover,
 * so even a one-frame lag cannot flash the hero through.
 *
 * The bee is the real brand mark — the same embedded PNG the
 * certificate QR composites (lib/certificates/assets/images.json),
 * bundled as a data URI so it renders instantly with no network
 * fetch. The wordmark is gradient text (the site's .gradient-text).
 * If the bee image ever fails to load, the wordmark letters carry
 * the brand on their own.
 */
const LETTERS = 'CODEBETTLE'.split('');
const BEE_SRC = `data:image/png;base64,${images.bee}`;
const UNDERLINE_AT_MS = INTRO_TYPE_AT_MS + INTRO_TYPE_DURATION_MS;
const WAVE_AT_MS = 4600;
const SKIP_REVEAL_MS = 450;
// Soft cinematic ease-out (slow landing, no snap) — the retune's
// house ease for the letter rise, underline and wave. The reveal
// keeps easeInOut, just slower.
const SOFT_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export default function WebsiteIntro() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<'idle' | 'playing' | 'revealing' | 'done'>('idle');
  const [skipped, setSkipped] = useState(false);
  const [typed, setTyped] = useState('');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervals = useRef<ReturnType<typeof setInterval>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    intervals.current.forEach(clearInterval);
    timers.current = [];
    intervals.current = [];
  };

  // Mount: tell the pre-hydration script's fallback we are alive,
  // then play on a full document load of "/" in a fresh session. The
  // pre-hydration flag is the normal trigger — but it is NOT the only
  // one. Mobile fix (20 Nov 2026): the script's cover fallback drops
  // the flag if React has not mounted yet, and on a slow phone
  // hydration can take longer than the fallback — the flag was then
  // gone before this effect ran, so the intro never played on mobile
  // at all. The session flag is the same source of truth (the script
  // checks it before flagging), so play whenever the session has not
  // seen the intro. Reduced motion may still be unresolved (null) on
  // the very first client render — read the media query directly so
  // a null never plays the intro for a reduced-motion user. This
  // effect runs once per component lifetime in the root layout, and
  // SPA navigation does not remount the layout, so the intro still
  // never replays on internal route changes. No viewport / pointer
  // gate anywhere: the intro plays on phones exactly as on desktop.
  useEffect(() => {
    (window as unknown as { __cbIntroMounted?: boolean }).__cbIntroMounted = true;
    const flagged =
      document.documentElement.getAttribute(`data-${INTRO_DATA_ATTR}`) === 'show';
    const prefersReduced =
      reduceMotion ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (pathname === '/' && !prefersReduced && (flagged || !hasSeenIntro())) {
      document.documentElement.removeAttribute(`data-${INTRO_DATA_ATTR}`);
      setPhase('playing');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Finish: mark the session, tell the hero to start, unmount.
  const finish = () => {
    clearTimers();
    markIntroSeen();
    dispatchIntroDone();
    try {
      document.documentElement.removeAttribute(`data-${INTRO_DATA_ATTR}`);
    } catch {
      // Already gone — nothing to do.
    }
    setPhase('done');
  };

  // Skip: jump straight to the (faster) circular reveal.
  const skip = () => {
    if (phase !== 'playing') return;
    clearTimers();
    setSkipped(true);
    setPhase('revealing');
  };

  // Playing: lock the background scroll, type the tagline, and
  // auto-advance to the reveal at 5.2s.
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const typeTimer = setTimeout(() => {
      let i = 0;
      const interval = setInterval(() => {
        i += 1;
        setTyped(INTRO_TAGLINE.slice(0, i));
        if (i >= INTRO_TAGLINE.length) clearInterval(interval);
      }, INTRO_TYPE_MS_PER_CHAR);
      intervals.current.push(interval);
    }, INTRO_TYPE_AT_MS);
    timers.current.push(typeTimer);

    const revealTimer = setTimeout(() => setPhase('revealing'), INTRO_REVEAL_AT_MS);
    timers.current.push(revealTimer);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (phase === 'idle' || phase === 'done') return null;

  const revealMs = skipped ? SKIP_REVEAL_MS : INTRO_REVEAL_MS;

  return (
    <>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="CodeBettle intro animation"
        onClick={skip}
        className="fixed inset-0 z-[10000] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-[#0A0A0A] px-6"
        initial={{ clipPath: 'circle(150% at 50% 50%)' }}
        animate={
          phase === 'revealing'
            ? { clipPath: 'circle(0% at 50% 50%)' }
            : { clipPath: 'circle(150% at 50% 50%)' }
        }
        transition={{ duration: revealMs / 1000, ease: 'easeInOut' }}
        onAnimationComplete={() => {
          if (phase === 'revealing') finish();
        }}
      >
        {/* Scene 1 — gold particles drifting upward. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {INTRO_PARTICLES.map((p, i) => (
            <motion.span
              key={i}
              className="absolute rounded-full bg-primary"
              style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size }}
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: [0, 0.9, 0], y: -p.drift }}
              transition={{ duration: 3.4, delay: p.delay, ease: 'easeOut' }}
            />
          ))}
        </div>

        {/* Scene 4 — gold rings rippling behind the logo. */}
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2">
          {[0, 1].map((i) => (
            <motion.span
              key={i}
              className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/40 sm:h-72 sm:w-72"
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1.7, opacity: [0, 0.6, 0] }}
              transition={{ duration: 1.5, delay: WAVE_AT_MS / 1000 + i * 0.25, ease: 'easeOut' }}
            />
          ))}
        </div>

        {/* Scene 2 — bee mark with a gold glow, then the wordmark letters. */}
        <div className="relative flex flex-col items-center">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 70, damping: 18, delay: 0.8 }}
            className="relative"
          >
            <div aria-hidden="true" className="absolute -inset-10 rounded-full bg-primary/25 blur-3xl" />
            {/* eslint-disable-next-line @next/next/no-img-element — the bee
                is a bundled data URI (no network fetch, no next/image
                optimiser round-trip); the <img> renders instantly. */}
            <img
              src={BEE_SRC}
              alt="CodeBettle bee"
              width={160}
              height={160}
              className="relative h-24 w-24 sm:h-28 sm:w-28"
              style={{ filter: 'drop-shadow(0 0 18px rgba(245,197,24,0.45))' }}
            />
          </motion.div>

          <div aria-label="CODEBETTLE" className="gradient-text mt-5 flex text-[clamp(1.6rem,6vw,3rem)] font-black tracking-[0.18em]">
            {LETTERS.map((letter, i) => (
              <motion.span
                key={i}
                className="inline-block"
                initial={{ y: 28, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.7, delay: 1.0 + i * 0.08, ease: SOFT_EASE }}
              >
                {letter}
              </motion.span>
            ))}
          </div>

          {/* Scene 3 — tagline types in, then the gold underline draws. */}
          <p className="mt-6 max-w-xl text-center text-sm leading-relaxed text-muted sm:text-base">
            {typed}
            <span aria-hidden="true" className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-primary align-middle" />
          </p>
          <motion.div
            aria-hidden="true"
            className="mt-4 h-[2px] w-48 origin-left bg-primary sm:w-64"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.7, delay: UNDERLINE_AT_MS / 1000, ease: SOFT_EASE }}
          />

          {/* Scene 4 — the gold wavy line (the video's squiggle motif, reimagined in gold). */}
          <motion.svg
            aria-hidden="true"
            viewBox="0 0 600 24"
            className="mt-8 w-[min(420px,80vw)]"
            initial={false}
          >
            <motion.path
              d="M0 12 Q 75 0, 150 12 T 300 12 T 450 12 T 600 12"
              fill="none"
              stroke="#F5C518"
              strokeWidth="2"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.0, delay: WAVE_AT_MS / 1000, ease: SOFT_EASE }}
            />
          </motion.svg>
        </div>

        {/* Skip — tap anywhere works too; this is the explicit affordance. */}
        <button
          type="button"
          onClick={skip}
          className="absolute bottom-6 cursor-pointer rounded-full border border-dark-border bg-dark-card/70 px-4 py-2 text-xs font-medium text-muted backdrop-blur-sm transition-colors hover:text-foreground"
        >
          Skip intro →
        </button>
      </motion.div>

      {/* Scene 5 — the gold ring that expands with the circular reveal.
          A sibling of the overlay (not inside it) so the overlay's
          collapsing clip-path cannot clip it. */}
      {phase === 'revealing' && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none fixed left-1/2 top-1/2 z-[10001] h-[180vmax] w-[180vmax] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary"
          initial={{ scale: 0.02, opacity: 1 }}
          animate={{ scale: 1, opacity: [1, 1, 0] }}
          transition={{ duration: revealMs / 1000, times: [0, 0.7, 1], ease: 'easeInOut' }}
        />
      )}
    </>
  );
}
