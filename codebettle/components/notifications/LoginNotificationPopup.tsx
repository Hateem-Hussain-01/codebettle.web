'use client';
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, Megaphone, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import {
  formatNotificationDateTime,
  headingForCategory,
  needsAcknowledgement,
  normaliseCategory,
  type PendingNotification,
} from './notification-helpers';

/**
 * Login notification popup (Phase 3, Worker B).
 *
 * Mounted once in PortalLayout, so it runs after login for every
 * portal (student / instructor / admin) and never on public/auth
 * pages. On mount it fetches GET /api/notifications?pending=true and
 * shows one unread acknowledgement-required notification at a time,
 * top-down, dark/gold to match the auth design.
 *
 * Rules:
 * - requiresAcknowledge=true: the Close button is hidden and a hint
 *   ("Please acknowledge to continue") is shown instead — the user
 *   must press Acknowledge before the popup moves on. There is no
 *   backdrop, so the page behind stays usable.
 * - Phase 7: if the acknowledge/read POST itself fails, the popup
 *   still advances/dismisses locally instead of trapping the user —
 *   the item stays unacknowledged server-side, so the pending feed
 *   shows it again at the next login.
 * - Anything else: Close dismisses that notification and shows the
 *   next one; after the last one the popup disappears.
 * - If the fetch fails (API not deployed yet, network error, 401),
 *   the popup renders nothing and logs the error — it must NEVER
 *   trap the user or block the dashboard.
 */
export default function LoginNotificationPopup() {
  const [notifications, setNotifications] = useState<PendingNotification[] | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/notifications?pending=true');
        if (!res.ok) {
          // Pending endpoint not deployed yet, or session gone — never block.
          console.error('[LoginNotificationPopup] pending fetch failed:', res.status);
          return;
        }
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        const list = Array.isArray(data?.notifications) ? (data.notifications as PendingNotification[]) : [];
        setNotifications(list);
        setIndex(0);
      } catch (error) {
        // Network failure — render nothing, never block login/dashboard.
        console.error('[LoginNotificationPopup] pending fetch failed:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const advance = useCallback(() => {
    setIndex((i) => i + 1);
  }, []);

  const current: PendingNotification | undefined = notifications?.[index];
  const mustAcknowledge = current ? needsAcknowledgement(current) : false;

  const handlePrimary = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      const endpoint = mustAcknowledge
        ? `/api/notifications/${current.id}/acknowledge`
        : `/api/notifications/${current.id}/read`;
      const res = await fetch(endpoint, { method: 'POST' });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      advance();
    } catch (error) {
      // Phase 7: a failed acknowledge/read must NEVER trap the user —
      // dismiss locally anyway. The item stays unacknowledged
      // server-side, so the pending feed (which keys on
      // acknowledgedAt, not readAt) shows it again at the next login.
      console.error('[LoginNotificationPopup] mark failed — dismissing locally:', error);
      advance();
    } finally {
      setBusy(false);
    }
  };

  const heading = current ? headingForCategory(current.category) ?? current.title : '';
  const category = current ? normaliseCategory(current.category) : 'general';
  const isWarning = category === 'warning';
  const isImportant = category === 'important' || category === 'special_notice';

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.id}
          initial={{ y: '-110%' }}
          animate={{ y: 0 }}
          exit={{ y: '-110%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 260 }}
          className="fixed top-0 inset-x-0 z-50"
          role="dialog"
          aria-label={heading}
        >
          <div className="mx-auto max-w-2xl px-3 sm:px-6 pt-3">
            <div
              className={`rounded-2xl border bg-dark-card elev-3 p-5 sm:p-6 ${
                isWarning ? 'border-red-400/40' : isImportant ? 'border-primary/50' : 'border-dark-border'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isWarning ? 'bg-red-400/10 text-red-400' : 'bg-primary/10 text-primary-text'
                    }`}
                  >
                    {isWarning ? <AlertTriangle className="w-5 h-5" /> : <Megaphone className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-primary-text text-xs font-semibold uppercase tracking-wide">{heading}</p>
                    <p className="text-foreground font-bold text-base leading-snug mt-0.5">{current.title}</p>
                    <p className="text-muted text-xs mt-1">
                      {current.senderName?.trim() || 'CodeBettle Admin'} ·{' '}
                      {formatNotificationDateTime(current.createdAt)}
                    </p>
                  </div>
                </div>
                {notifications && notifications.length > 1 && (
                  <span className="text-muted text-xs whitespace-nowrap mt-1">
                    {index + 1} of {notifications.length}
                  </span>
                )}
              </div>

              <p className="text-foreground/85 text-sm mt-3 whitespace-pre-wrap">{current.body}</p>

              {current.linkUrl && (
                <a
                  href={current.linkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-primary-text text-sm mt-2 hover:underline"
                >
                  Open link
                </a>
              )}

              <div className="flex items-center justify-between gap-3 mt-4">
                <div className="text-xs text-muted">
                  {mustAcknowledge ? (
                    <span className="flex items-center gap-1.5 text-primary-text">
                      <Check className="w-3.5 h-3.5" />
                      Please acknowledge to continue
                    </span>
                  ) : (
                    <span>You can close this notification.</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!mustAcknowledge && (
                    <Button variant="secondary" size="sm" onClick={advance} disabled={busy}>
                      <X className="w-4 h-4" />
                      Close
                    </Button>
                  )}
                  <Button size="sm" onClick={handlePrimary} loading={busy}>
                    {mustAcknowledge ? 'Acknowledge' : 'Mark as Read'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
