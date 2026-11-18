'use client';

import dynamic from 'next/dynamic';
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'framer-motion';
import { useEffect, useState } from 'react';
import { shouldRenderScene } from '@/lib/hero-scene';
import { scrollSceneOpacity } from '@/lib/scroll-3d';
import { INTRO_DONE_FALLBACK_MS, introAlreadyDone, onIntroDone } from '@/lib/intro';

/**
 * Hero 3D scene wrapper — fully-3D public site, Step 1 (Eman, 17 Nov
 * 2026). The only place HeroScene is mounted.
 *
 * - Lazy: the R3F scene (three + the canvas) is code-split out of the
 *   first paint with next/dynamic ssr:false — the hero text, CTAs and
 *   PremiumBackdrop render first; the 3D layer streams in after.
 *   (ssr:false only works in a Client Component — this file is one;
 *   see node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md.)
 * - Gated by shouldRenderScene (lib/hero-scene.ts): reduced motion,
 *   small screens / coarse pointers, and no-WebGL browsers all get
 *   the static fallback — this wrapper renders null and the hero
 *   keeps its PremiumBackdrop, so it is never empty and never moves
 *   for people who asked it not to.
 * - Hydration-safe: the first client render matches the server
 *   (null) — the media/WebGL checks run in useEffect after hydration.
 * - Step 2 (17 Nov 2026): scroll-driven — the wrapper takes the
 *   hero's scrollYProgress (from HeroSection's useScroll) and fades
 *   the scene out as the hero scrolls away (lib/scroll-3d.ts), while
 *   the scene itself dollies its camera and pauses its render loop
 *   once fully out of view.
 */
const HeroScene = dynamic(() => import('./HeroScene'), { ssr: false, loading: () => null });

export default function HeroSceneWrapper({ scrollYProgress }: { scrollYProgress: MotionValue<number> }) {
  const reduceMotion = useReducedMotion();
  const [isMobile, setIsMobile] = useState(false);
  const [webglSupported, setWebglSupported] = useState(false);
  // Step 2: the scene dissolves as the hero scrolls away — the
  // background recedes while the hero content stays put.
  const sceneOpacity = useTransform(scrollYProgress, (v) => scrollSceneOpacity(v));
  // Website intro (18 Nov 2026): when the intro plays, the scene
  // fades in behind the hero at the reveal instead of popping in
  // under the overlay. The fade is driven by a MotionValue (not
  // React state) so the server render and the first client render
  // are identical (opacity 1) — no hydration mismatch. Only after
  // hydration, when an intro is actually pending on this load
  // (!introAlreadyDone()), the value drops to 0 — invisible, the
  // opaque overlay covers the hero — and animates back to 1 on the
  // intro-done event. Loads with no intro never touch the value:
  // zero behaviour change. A 6s fallback fades in anyway if the
  // event is ever missed.
  const introFade = useMotionValue(1);

  useEffect(() => {
    setIsMobile(window.matchMedia('(max-width: 768px), (pointer: coarse)').matches);
    try {
      const canvas = document.createElement('canvas');
      setWebglSupported(!!(canvas.getContext('webgl2') || canvas.getContext('webgl')));
    } catch {
      setWebglSupported(false);
    }
  }, []);

  useEffect(() => {
    if (introAlreadyDone()) return undefined;
    introFade.set(0);
    const off = onIntroDone(() => {
      void animate(introFade, 1, { duration: 0.8, ease: 'easeOut' });
    });
    const fallback = setTimeout(() => {
      void animate(introFade, 1, { duration: 0.8, ease: 'easeOut' });
    }, INTRO_DONE_FALLBACK_MS);
    return () => {
      off();
      clearTimeout(fallback);
    };
  }, [introFade]);

  if (!shouldRenderScene({ reducedMotion: reduceMotion ?? false, isMobile, webglSupported })) {
    return null;
  }

  return (
    <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity: sceneOpacity }}>
      <motion.div className="absolute inset-0" style={{ opacity: introFade }}>
        <HeroScene scrollYProgress={scrollYProgress} />
      </motion.div>
    </motion.div>
  );
}
