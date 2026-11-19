'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Page transitions (Eman, 18 Nov 2026 — dashboard follow-up).
 *
 * Portal pages crossfade + rise slightly when the route changes.
 * The sidebar and topbar stay FIXED — they live outside this
 * wrapper in PortalLayout and never re-animate, so only the page
 * content moves (the video's page-change feel, CodeBettle's own
 * timing: FadeIn's 0.45s ease-out, a smaller 8px rise because a
 * whole page rising 16px reads as too much).
 *
 * Enter-only, on purpose: the outgoing page disappears the moment
 * navigation commits and the new page fades in — the transition
 * never holds navigation hostage waiting for an exit animation
 * (a wait-for-exit design would delay the new content by the exit
 * duration on every click).
 *
 * The key is the pathname (Next.js docs: usePathname is the client
 * hook for the current route; layouts preserve state across
 * navigations, so the wrapper persists and only the keyed child
 * remounts). Children are server components passed through as
 * props — the same passthrough FadeIn uses — never an async server
 * component wrapped in motion.* directly (PR #60 lesson: that
 * 500s the page).
 *
 * Reduced motion: a plain div, no animation, content instantly.
 *
 * NOTE — why the preference is read in an effect, NOT during render
 * (and NOT via framer-motion's useReducedMotion()): the first-load
 * render must agree with SSR, which has no window and always renders
 * the motion.div. Reading matchMedia during render (or via
 * useReducedMotion(), which in framer-motion 12.40 freezes its first
 * value in a useState initial and never re-reads it) makes the client
 * render a plain div where SSR rendered a motion.div — and the
 * hydration pass then leaves the SSR motion.div's inline
 * `opacity: 0` in place, so the whole portal main stays blank under
 * reduced motion (proven in headless Chromium, 19 Nov 2026: first
 * load opacity 0 for 3s+; any later re-render — SPA navigation, even
 * a sidebar toggle — replaced the node and showed the content). A
 * post-mount effect reads the live media query and flips state, so
 * the plain div arrives through a normal re-render, which DOES
 * replace the node. Normal users are unaffected: the effect reads
 * false, no state change, the motion.div animates exactly as before.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduceMotion(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  if (reduceMotion) {
    return <div>{children}</div>;
  }

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
