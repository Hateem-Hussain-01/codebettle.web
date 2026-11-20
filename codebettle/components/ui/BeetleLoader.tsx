'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import images from '@/lib/certificates/assets/images.json';

/**
 * Beetle loading effect (Eman, 20 Nov 2026 — "web mn koi loading
 * effect bhi lagao beetle ko use krty howay").
 *
 * The real CodeBettle bee — the same embedded PNG the intro uses
 * (lib/certificates/assets/images.json, bundled as a data URI so it
 * renders instantly with no network fetch) — bobs gently with a soft
 * gold glow while a portal segment loads. It renders inside the page
 * content area via the segment loading.tsx files, so the sidebar and
 * topbar stay mounted and usable while it shows: no full-screen
 * overlay, no scroll lock, no artificial delay. If a navigation is
 * instant, the loader is simply brief or never seen.
 *
 * Reduced motion: a plain static bee, no animation. The preference
 * is read in a post-mount effect — the same pattern as PageTransition
 * (reading matchMedia during render, or via framer-motion's
 * useReducedMotion(), would disagree with SSR and leave a stale
 * first frame).
 *
 * Dark + gold only. This is a LOADING effect — the cursor is
 * untouched (normal/default per Eman's standing decision, 13 Nov,
 * re-confirmed 14 Nov).
 */
const BEE_SRC = `data:image/png;base64,${images.bee}`;

export default function BeetleLoader({ label = 'Loading…' }: { label?: string }) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduceMotion(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  const bee = (
    <div className="relative">
      <div aria-hidden="true" className="absolute -inset-6 rounded-full bg-primary/25 blur-2xl" />
      {/* eslint-disable-next-line @next/next/no-img-element — same reason
          as the intro: bundled data URI, renders instantly, no
          next/image optimiser round-trip. */}
      <img
        src={BEE_SRC}
        alt=""
        width={64}
        height={64}
        className="relative h-16 w-16"
        style={{ filter: 'drop-shadow(0 0 12px rgba(245,197,24,0.4))' }}
      />
    </div>
  );

  return (
    <div
      role="status"
      aria-label={label}
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 py-12"
    >
      {reduceMotion ? (
        bee
      ) : (
        <motion.div
          initial={{ y: 0 }}
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          {bee}
        </motion.div>
      )}
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}
