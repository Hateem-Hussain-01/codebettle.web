'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import {
  INTRO_DATA_ATTR,
  INTRO_VIDEO_SRC,
  dispatchIntroDone,
  hasSeenIntro,
  markIntroSeen,
} from '@/lib/intro';

/**
 * Website intro (Eman, 21 Nov 2026 — "EXACT COPY NA KRO, WO EXACT
 * VIDEO HE LAGA DO WAHA PAY").
 *
 * The intro is the EXACT video he sent (the CodeBettle logo intro,
 * 6.4s, 1920x1080 — tunnel + bee logo, the shorter replacement for
 * the 9.7s video, 21 Nov 2026) served as-is from
 * public/intro-video.mp4 — no rebuild, no re-animation, no trim, no
 * re-edit. (The notiune reference recording was a misread — it is
 * NOT the intro and must not be embedded.) The previous animated
 * intro (bee + letters + tagline, PRs #79/#85) is gone; this
 * component is a thin player around the file.
 *
 * The video autoplays MUTED (browsers block sound autoplay) and
 * plays on the landing page ONLY, once per browser session on the
 * first full load of "/". Tap/click anywhere, the Skip button, or
 * Escape dismisses it at once; it also ends on its own when the
 * video finishes, and if the file fails to load it dismisses
 * immediately instead of stranding the page on a black overlay.
 * Reduced motion skips the video entirely. It never blocks auth,
 * routing or dashboards — it mounts in the root layout but plays
 * only on "/" in a fresh session.
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
 * overlay mounts (same commit, before paint) — the swap is
 * invisible. The overlay itself is z-10000, above the cover, so
 * even a one-frame lag cannot flash the hero through.
 *
 * The video is landscape HD (1920x1080), and it plays FIT-TO-SCREEN
 * on every viewport — object-cover, so it always fills the whole
 * intro viewport and crops as needed, never letterboxes or
 * pillarboxes. On a portrait phone the sides crop; on a wide
 * desktop the top/bottom crop. No black bars anywhere (Eman, 21 Nov
 * 2026 — his main complaint about the 9.7s video was the bars).
 */
export default function WebsiteIntro() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<'idle' | 'playing' | 'done'>('idle');
  const videoRef = useRef<HTMLVideoElement>(null);

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

  // Finish: stop the video, mark the session, tell the hero to start, unmount.
  const finish = () => {
    try {
      videoRef.current?.pause();
    } catch {
      // Already stopped — nothing to do.
    }
    markIntroSeen();
    dispatchIntroDone();
    try {
      document.documentElement.removeAttribute(`data-${INTRO_DATA_ATTR}`);
    } catch {
      // Already gone — nothing to do.
    }
    setPhase('done');
  };

  // Skip: tap/click anywhere, the Skip button, or Escape — the video
  // ends at once (there is no reveal animation to jump to anymore).
  const skip = () => {
    if (phase !== 'playing') return;
    finish();
  };

  // Playing: lock the background scroll, and start the video. The
  // muted attribute alone is not always honoured by React, so the
  // ref callback sets the property directly and kicks playback —
  // muted autoplay is allowed everywhere, and a rejected play() (a
  // browser that still refuses) leaves the first frame up with the
  // Skip button as the escape.
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (phase === 'idle' || phase === 'done') return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="CodeBettle intro video"
      onClick={skip}
      className="fixed inset-0 z-[10000] flex cursor-pointer items-center justify-center overflow-hidden bg-[#0A0A0A]"
    >
      {/* The exact video file, as-is — muted autoplay, inline on
          phones (no fullscreen takeover), cover-fit on every screen
          (fills the viewport, crops as needed, never any black bars). */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption — the
          video is a silent screen recording; there is no speech to
          caption. */}
      <video
        ref={(el) => {
          videoRef.current = el;
          if (el) {
            el.muted = true;
            const p = el.play();
            if (p) p.catch(() => undefined);
          }
        }}
        src={INTRO_VIDEO_SRC}
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={finish}
        onError={finish}
        className="h-full w-full object-cover"
      />
      {/* Skip — tap anywhere works too; this is the explicit affordance. */}
      <button
        type="button"
        onClick={skip}
        className="absolute bottom-6 cursor-pointer rounded-full border border-dark-border bg-dark-card/70 px-4 py-2 text-xs font-medium text-muted backdrop-blur-sm transition-colors hover:text-foreground"
      >
        Skip intro →
      </button>
    </div>
  );
}
