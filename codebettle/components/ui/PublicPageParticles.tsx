'use client';

import { Canvas } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import { useEffect, useRef, useState } from 'react';

/**
 * Gold particle field for the shared public-page backdrop —
 * fully-3D public site, Step 2 (Eman, 17 Nov 2026). A sparse, slow
 * React Three Fiber Sparkles field (gold only, #F5C518), mounted by
 * PublicPageBackdrop on the public pages. Never mounted directly
 * (PublicPageBackdrop lazy-loads this with next/dynamic ssr:false and
 * gates it on desktop + WebGL + no reduced motion).
 *
 * Cheap on purpose: ~45 particles, dpr capped at 1.5, and the render
 * loop pauses (Canvas frameloop 'never') while this backdrop is
 * outside the viewport — an IntersectionObserver resumes it when
 * scrolled back into view. No wasted GPU on unseen particles.
 */
export default function PublicPageParticles() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 10], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
        frameloop={inView ? 'always' : 'never'}
      >
        <Sparkles count={45} scale={[12, 6, 2]} size={2} speed={0.2} color="#F5C518" opacity={0.5} />
      </Canvas>
    </div>
  );
}
