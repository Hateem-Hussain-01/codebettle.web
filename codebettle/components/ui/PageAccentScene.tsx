'use client';

import dynamic from 'next/dynamic';
import { useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { shouldRenderScene } from '@/lib/hero-scene';

/**
 * Small 3D accent for the About / Spotlight / Contact heroes —
 * fully-3D public site, Step 3 (Eman, 17 Nov 2026). A few floating
 * gold shapes + a sparse particle field at the hero edges, behind
 * the hero content. The Home hero scene is the showpiece; this is
 * the same world at a whisper — it gives each page its own 3D
 * character without competing with the hero.
 *
 * - `layout` varies the shape placement per page (About: both edges,
 *   Spotlight: right edge, Contact: left edge, sparser).
 * - Same gating as the hero scene and the shared backdrop: desktop +
 *   WebGL + no reduced motion only. Phones, reduced-motion users and
 *   no-WebGL browsers get nothing here — the hero already has the
 *   static PremiumBackdrop behind it, so the page is never empty.
 * - The canvas itself is code-split (next/dynamic ssr:false) and
 *   pauses its render loop out of view, so it costs no GPU when the
 *   hero has scrolled away.
 * - Hydration-safe: the first client render matches the server (no
 *   canvas) — the media/WebGL checks run in useEffect after
 *   hydration, exactly like HeroSceneWrapper.
 */
const PageAccentSceneCanvas = dynamic(() => import('./PageAccentSceneCanvas'), {
  ssr: false,
  loading: () => null,
});

export type PageAccentLayout = 'split' | 'left' | 'right';

export default function PageAccentScene({ layout = 'split' }: { layout?: PageAccentLayout }) {
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

  const showScene = shouldRenderScene({
    reducedMotion: reduceMotion ?? false,
    isMobile,
    webglSupported,
  });

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {showScene && <PageAccentSceneCanvas layout={layout} />}
    </div>
  );
}
