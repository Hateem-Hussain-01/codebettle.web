'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Small back button, shown on every page (PR #33).
 *
 * Unobtrusive (small, top-left, dark + gold) and layout-safe. Goes
 * back in history when there is one; on a page with no history (e.g.
 * the home page opened directly) it goes home instead of doing
 * nothing. Hidden on the home page itself — there is nothing to go
 * back to there.
 *
 * Two mountings (the layouts have different chrome):
 * - Fixed chip (default): `fixed` above the content, positioned by
 *   `className` (default `top-20 left-4`). Used on public pages,
 *   which sit under the sticky navbar — their headings start far
 *   below the chip (main pt-16 + hero py-16/20), so it cannot cover
 *   a title.
 * - Inline (`inline` prop): in-flow, no `fixed` positioning, for the
 *   portal header. The portal used to mount the fixed chip at
 *   top-[4.5rem] — 72px — but the portal header is only h-14 (56px)
 *   and the content starts at p-4/p-6, so the chip sat right on top
 *   of every page heading (Eman, 14 Nov 2026: the "← Back" chip
 *   covered the "Quizzes" title on every admin/student page). In
 *   the header it is always visible, never covers a heading, and
 *   works on every portal page.
 */
export default function BackButton({ className, inline = false }: { className?: string; inline?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    // window.history.length counts the current entry; > 1 means a
    // previous page exists in this tab's history.
    setCanGoBack(window.history.length > 1);
  }, [pathname]);

  if (pathname === '/') return null;

  function handleBack() {
    if (canGoBack) router.back();
    else router.push('/');
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label="Go back"
      title="Go back"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-dark-border bg-dark-card/90 px-3 py-1.5 text-xs font-semibold text-muted shadow-lg backdrop-blur transition-colors hover:text-primary-text hover:border-primary/50',
        // Exactly one positioning mode: inline is in-flow (portal
        // header), the default is the fixed chip (public pages).
        // cn() is a plain join (lib/utils.ts) — never emit both
        // `fixed` and `relative` or the winner is CSS-order luck.
        inline ? 'relative shrink-0' : cn('fixed z-40', className ?? 'top-20 left-4'),
        inline && className,
      )}
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      Back
    </button>
  );
}
