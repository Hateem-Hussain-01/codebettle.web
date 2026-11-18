'use client';
import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

interface CountUpProps {
  /** The final value to count up to (always a real computed value — never invented). */
  to: number;
  /** One decimal place (e.g. an average rating like 4.5). Defaults to false. */
  decimal?: boolean;
  /** Text before the number (e.g. "PKR "). Defaults to ''. */
  prefix?: string;
  /** Text after the number (e.g. "K", "+"). Defaults to ''. */
  suffix?: string;
}

/**
 * CodeBettle count-up (Dashboard V32, 18 Nov 2026).
 *
 * The MOTION is CodeBettle's own, not the reference video's: the same
 * slow, damped ~1.8s / 60-step count as the hero stats
 * (HeroLoadCounter in components/sections/HeroSection.tsx), starting
 * on mount. The video's fast tick and its code-snippet values were
 * the idea only — the character (duration, steps, easing) is the
 * hero's, so the dashboards feel like CodeBettle, not a copy of
 * "Mercato".
 *
 * Reduced-motion users see the final value immediately (no animation,
 * no intermediate values). Integers render with toLocaleString
 * (1,500), decimals with one decimal place (4.5).
 */
export default function CountUp({ to, decimal = false, prefix = '', suffix = '' }: CountUpProps) {
  const reduceMotion = useReducedMotion();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (reduceMotion) {
      setCount(to);
      return;
    }
    const duration = 1800;
    const steps = 60;
    const step = to / steps;
    let current = 0;
    const interval = setInterval(() => {
      current = Math.min(current + step, to);
      setCount(decimal ? Math.round(current * 10) / 10 : Math.floor(current));
      if (current >= to) clearInterval(interval);
    }, duration / steps);
    return () => clearInterval(interval);
  }, [to, decimal, reduceMotion]);

  return (
    <span>
      {prefix}
      {decimal ? count.toFixed(1) : count.toLocaleString()}
      {suffix}
    </span>
  );
}
