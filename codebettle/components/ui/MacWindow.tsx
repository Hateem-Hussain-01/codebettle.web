import type { ReactNode } from 'react';

/**
 * Mac-window frame for the Home page (Eman, 17 Nov 2026).
 *
 * The hero + stats + featured courses sit inside ONE browser-window
 * frame: a top bar with a centred address bar (codebettle.com) and
 * NO traffic-light dots — Eman removed the section dots; only the
 * course cards keep their dots (see CourseCard's editor header).
 * The dots are decorative only everywhere: no click handlers, no
 * hover symbols.
 *
 * The global fixed navbar is NOT duplicated inside the window — it
 * stays above it (the preview's inner navbar was illustrative; the
 * preview was a standalone mock without the site's real navbar).
 * The wrapper clears the fixed navbar (h-16) with top padding, and
 * the frame's rounded corners clip the hero's 3D scene and the
 * sections below it (overflow-hidden on the frame; the hero itself
 * is already overflow-hidden, so nothing about the scene changes).
 *
 * Server component — no client JS of its own.
 */
export default function MacWindow({ children }: { children: ReactNode }) {
  return (
    <div className="pt-16">
      <div className="mx-auto max-w-[1440px] px-3 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-3xl border border-dark-border shadow-[0_32px_80px_-24px_rgba(0,0,0,0.8)]">
          {/* Top bar — address bar only, NO dots (Eman, 17 Nov 2026). */}
          <div className="flex items-center justify-center border-b border-dark-border bg-dark-card px-4 py-3">
            <span className="inline-flex items-center rounded-lg border border-dark-border bg-background px-4 py-1.5 font-mono text-xs text-muted">
              codebettle.com
            </span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
