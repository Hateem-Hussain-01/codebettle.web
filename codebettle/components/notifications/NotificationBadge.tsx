'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Unread-count badge for the portal bell (Phase 3, Worker B).
 *
 * Badge only — the bell link itself stays in PortalLayout (the
 * portal-switch tests assert the `/${portalSlug}/notifications` link
 * lives there, and that PortalLayout keeps only its logout fetch, so
 * this read lives here, not in the layout). Fetches
 * GET /api/notifications?limit=1 on mount and on every route change;
 * only unreadCount is read. A failed fetch hides the badge instead of
 * breaking the layout (null = "unknown"). Display-only: the
 * notifications page and its API enforce ownership server-side.
 */
export default function NotificationBadge() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/notifications?limit=1');
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!cancelled && typeof data?.unreadCount === 'number') setUnreadCount(data.unreadCount);
      } catch {
        // Notifications unavailable — badge stays hidden, layout unaffected.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (unreadCount === null || unreadCount <= 0) return null;
  return (
    <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 bg-primary text-black text-[11px] font-bold rounded-full flex items-center justify-center">
      {unreadCount > 9 ? '9+' : unreadCount}
    </span>
  );
}
