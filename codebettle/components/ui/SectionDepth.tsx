'use client';

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useRef, type ReactNode } from 'react';
import { sectionDepthRotation } from '@/lib/section-depth';

/**
 * Scroll-driven depth for a public-page section — fully-3D public
 * site, Step 3 (Eman, 17 Nov 2026). As the section crosses the
 * viewport it leans gently toward the viewer on entry, settles flat
 * at the centre, and leans slightly away on exit (lib/section-depth.ts
 * maps the progress: rotateX 5° → 0° → −3°). Transform-only, so it
 * never triggers layout work; the angles are small on purpose — the
 * section should feel deep, not tilted.
 *
 * - Reduced motion: renders a plain div — no depth at all (on top of
 *   the global `MotionConfig reducedMotion="user"`).
 * - Scroll-driven, not pointer-driven, so it works the same on touch
 *   devices (phones get the same gentle depth as desktops).
 * - Never wraps a form or anything the user types into — the Contact
 *   form stays static; only the info column beside it gets depth.
 */
export default function SectionDepth({ children, className }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const rotateX = useTransform(scrollYProgress, (v) => sectionDepthRotation(v));

  if (reduceMotion) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <div ref={ref} className={className} style={{ perspective: 1200 }}>
      <motion.div style={{ rotateX, transformPerspective: 1200 }}>{children}</motion.div>
    </div>
  );
}
