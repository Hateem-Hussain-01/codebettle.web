'use client';

import dynamic from 'next/dynamic';
import { useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import PremiumBackdrop from '@/components/ui/PremiumBackdrop';
import { shouldRenderScene } from '@/lib/hero-scene';

/**
 * Shared public-page backdrop — fully-3D public site, Step 2 (Eman,
 * 17 Nov 2026). ONE component for all four public pages (Home,
 * About, Spotlight, Contact) — not four copies.
 *
 * - Always: the static PremiumBackdrop (gold glows + faint grid),
 *   so every public page has the same grid/glow treatment on every
 *   device, including phones and reduced-motion browsers.
 * - Desktop + WebGL + no reduced motion only: a lazy R3F gold
 *   particle field (PublicPageParticles, code-split with
 *   next/dynamic ssr:false) drifting slowly over the grid. Phones,
 *   reduced-motion users and no-WebGL browsers keep the static
 *   backdrop — never an empty or broken layer.
 * - Hydration-safe: the first client render matches the server (no
 *   particles) — the media/WebGL checks run in useEffect after
 *   hydration, exactly like HeroSceneWrapper.
 *
 * `particles` — the Home hero passes false: its hero scene already
 * carries the particle field, and a second particle canvas in the
 * same region would be wasted GPU.
 */
const PublicPageParticles = dynamic(() => import('./PublicPageParticles'), {
  ssr: false,
  loading: () => null,
});

export default function PublicPageBackdrop({
  variant = 'soft',
  particles = true,
}: {
  variant?: 'hero' | 'soft';
  particles?: boolean;
}) {
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

  const showParticles =
    particles && shouldRenderScene({ reducedMotion: reduceMotion ?? false, isMobile, webglSupported });

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <PremiumBackdrop variant={variant} />
      {showParticles && <PublicPageParticles />}
    </div>
  );
}
