'use client';

import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { computeTilt } from '@/lib/tilt';

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Maximum tilt in degrees. Defaults to 6 — subtle, premium, never seasick. */
  max?: number;
}

/**
 * Mouse-move 3D tilt wrapper — premium 3D public pages only (Eman,
 * 16 Nov 2026). Used by the Home / About / Spotlight / Contact
 * pages. NEVER used inside a dashboard.
 *
 * - The card leans toward the cursor (rotateX/rotateY on a 1000px
 *   perspective), smoothed with springs so it settles instead of
 *   snapping. GPU-friendly: transform only, no layout work.
 * - Reduced motion: renders a plain div — no tilt at all (on top of
 *   the global `MotionConfig reducedMotion="user"`).
 * - Touch / coarse pointers: no tilt (there is no cursor to follow);
 *   the card is a plain div. This is decided after hydration with a
 *   `pointer: fine` media query, so server and first client render
 *   match (no hydration mismatch).
 * - The inner layer is `flex h-full flex-col` with a `flex-1` child
 *   so a tilted card keeps the same full height it had as a bare
 *   grid item (equal-height card rows stay equal).
 */
export default function TiltCard({ children, className, style, max = 6 }: TiltCardProps) {
  const reduceMotion = useReducedMotion();
  const [finePointer, setFinePointer] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 200, damping: 22, mass: 0.6 });
  const springY = useSpring(rotateY, { stiffness: 200, damping: 22, mass: 0.6 });

  useEffect(() => {
    setFinePointer(window.matchMedia('(pointer: fine)').matches);
  }, []);

  const enabled = !reduceMotion && finePointer;

  if (!enabled) {
    return (
      <div ref={ref} className={className} style={style}>
        {children}
      </div>
    );
  }

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const { rotateX: rx, rotateY: ry } = computeTilt(e.clientX, e.clientY, rect, max);
    rotateX.set(rx);
    rotateY.set(ry);
  };

  const handleLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{ perspective: 1000, ...style }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <motion.div
        // The key is load-bearing (17 Nov 2026 — invisible stats):
        // when TiltCard flips from the plain div to the tilt wrapper
        // after hydration, React would otherwise REUSE the child
        // motion.div instance as this wrapper (same type, same
        // position) — and framer-motion keeps the child's stale
        // `initial` values on it (opacity 0, y 20/30), so the whole
        // card stays invisible forever even though the child's own
        // whileInView fires (the child reaches opacity 1 behind an
        // opacity-0 ancestor). The key forces a fresh mount of the
        // wrapper, so the child mounts fresh inside it with its fade
        // armed. Never remove this key without re-checking the stats
        // strip and the testimonials in a real browser.
        key="tilt-enabled"
        className="flex h-full flex-col [&>*]:flex-1"
        style={{ rotateX: springX, rotateY: springY, transformPerspective: 1000, transformStyle: 'preserve-3d' }}
      >
        {children}
      </motion.div>
    </div>
  );
}
