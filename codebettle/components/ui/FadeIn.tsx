'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

interface FadeInProps {
  children: ReactNode;
  /** Stagger delay in seconds (e.g. index * 0.05). Defaults to 0. */
  delay?: number;
  /** Starting vertical offset in px. Defaults to 16 (light rise). */
  y?: number;
  className?: string;
}

/**
 * Site-wide light entrance animation (item 5, Phase 6 style).
 *
 * Fade + small rise, once, on scroll into view — matching the existing
 * `initial={{ opacity: 0, y: 30 }} whileInView` pattern used by the
 * homepage sections (HeroSection, HowItWorks, StatsSection, ...).
 *
 * Reduced motion: `useReducedMotion` renders a plain div (no animation),
 * on top of the global `MotionConfig reducedMotion="user"` in
 * app/layout.tsx and the `prefers-reduced-motion` media query in
 * globals.css.
 */
export default function FadeIn({ children, delay = 0, y = 16, className }: FadeInProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
