'use client';

import dynamic from 'next/dynamic';
import { useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { shouldRenderScene } from '@/lib/hero-scene';

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
 */
const HeroScene = dynamic(() => import('./HeroScene'), { ssr: false, loading: () => null });

export default function HeroSceneWrapper() {
  const reduceMotion = useReducedMotion();
  const [isMobile, setIsMobile] = useState(false);
  const [webglSupported, setWebglSupported] = useState(false);

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
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <HeroScene />
    </div>
  );
}
