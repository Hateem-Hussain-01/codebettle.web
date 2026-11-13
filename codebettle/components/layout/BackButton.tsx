'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Small back button, shown on every page (PR #33).
 *
 * Unobtrusive (small, top-left, dark + gold) and layout-safe: it is a
 * fixed-position chip that floats above the content instead of taking
 * a row in any page layout, so it cannot break existing pages. Goes
 * back in history when there is one; on a page with no history (e.g.
 * the home page opened directly) it goes home instead of doing
 * nothing. Hidden on the home page itself — there is nothing to go
 * back to there.
 *
 * Positioning is passed in by the layout that mounts it, because
 * public pages and portal pages have different chrome: public pages
 * sit under the sticky navbar (top-20), portal pages under the
 * portal header and — on desktop — beside the 16rem sidebar
 * (lg:left-[17rem]).
 */
export default function BackButton({ className }: { className?: string }) {
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
        'fixed z-40 inline-flex items-center gap-1.5 rounded-full border border-dark-border bg-dark-card/90 px-3 py-1.5 text-xs font-semibold text-muted shadow-lg backdrop-blur transition-colors hover:text-primary-text hover:border-primary/50',
        className ?? 'top-20 left-4',
      )}
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      Back
    </button>
  );
}
