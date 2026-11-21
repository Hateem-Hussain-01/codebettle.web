'use client';

import dynamic from 'next/dynamic';
import { motion, useReducedMotion, useTransform, type MotionValue } from 'framer-motion';
import { useEffect, useState } from 'react';
import { shouldRenderScene } from '@/lib/hero-scene';
import { scrollSceneOpacity } from '@/lib/scroll-3d';

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
  // Hero readability (Eman, 20 Nov 2026 — first step: reduce
  // opacity, do NOT remove): the bright 3D shapes drifting behind
  // the headline hurt readability. The scene renders at 35%
  // opacity — still fully visible and animated, but the headline and
  // subtext now read clearly over it. The scroll fade above
  // multiplies on top of this base dim.
  const HERO_SCENE_OPACITY = 0.35;
  const sceneOpacityDimmed = useTransform(sceneOpacity, (v) => v * HERO_SCENE_OPACITY);

  useEffect(() => {
    setIsMobile(window.matchMedia('(max-width: 768px), (pointer: coarse)').matches);
    try {
      const canvas = document.createElement('canvas');
      setWebglSupported(!!(canvas.getContext('webgl2') || canvas.getContext('webgl')));
    } catch {
      setWebglSupported(false);
    }
  }, []);

  if (!shouldRenderScene({ reducedMotion: reduceMotion ?? false, isMobile, webglSupported })) {
    return null;
  }

  return (
    <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity: sceneOpacityDimmed }}>
      <div className="absolute inset-0">
        <HeroScene scrollYProgress={scrollYProgress} />
      </div>
    </motion.div>
  );
}
