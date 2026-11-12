'use client';
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Megaphone, X } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import type { Notification } from '@/lib/db/types';

/**
 * "Message from Your Teacher" login popup (Phase 3, Worker C).
 *
 * REAL STATE (verified against the tree, not the brief):
 * - Worker B's LoginNotificationPopup EXISTS and is mounted once in
 *   PortalLayout (all portals). It fetches GET /api/notifications?
 *   pending=true — unread + requiresAcknowledge=true, oldest first —
 *   and shows every pending notification, teacher ones included,
 *   with a CATEGORY heading ("Important Notice" / "Special
 *   Notification" / "Warning"). It accepts no heading override.
 * - The Notification model (Worker A) has NO teacher marker field:
 *   no senderRole, no senderName, no 'teacher_message' type. The only
 *   teacher signal is `linkUrl` pointing at a course
 *   (contains '/student/courses/') — admin compose validates linkUrl
 *   as an absolute http(s) URL, so a course link looks like
 *   https://<host>/student/courses/<id>.
 * - Therefore this popup shows ONLY the teacher messages Worker B's
 *   popup does NOT show: unread, course-linked, requiresAcknowledge
 *   === false. The two popups render DISJOINT sets, so they can never
 *   double-fire — no DOM marker, no second fetch of the same rows.
 *   It fetches the plain list (GET /api/notifications?limit=50) and
 *   filters client-side; it never fetches ?pending=true.
 *
 * KNOWN GAP (for the coordinator): a teacher message composed WITH
 * requiresAcknowledge=true surfaces in Worker B's shared popup with
 * the category heading ("Important Notice"), NOT "Message from Your
 * Teacher" — Worker B's component takes no heading override, and
 * this file must not edit it. If the teacher heading is wanted for
 * ack-required messages too, Worker B needs to add a heading
 * override for course-linked notifications (or teachers compose
 * those messages with requiresAcknowledge=false).
 *
 * - Dismissal: non-acknowledge messages get Close / "Got it", which
 *   marks the row read via POST /api/notifications/[id]/read so it
 *   never pops again. If a message IS passed in with
 *   requiresAcknowledge=true (only via the `messages` prop seam —
 *   the fetch path never yields one), the Close button is hidden and
 *   "Acknowledge" posts to /api/notifications/[id]/acknowledge.
 * - A failed fetch renders NOTHING — the user is never trapped.
 */
export type TeacherMessage = Notification & {
  /** May be added by API serialisation; not on the stored row. */
  senderName?: string | null;
};

/**
 * True when a notification is a targeted message from a teacher:
 * an explicit 'teacher_message' type (reserved, not used today) or a
 * course deep-link. A bare category ('important'/'general') is NOT
 * enough — any admin broadcast can be important.
 * Pure — unit-tested in tests/phase3-worker-c-requests.test.ts.
 */
export function isTeacherMessage(n: TeacherMessage): boolean {
  if (n.type === 'teacher_message') return true;
  const link = n.linkUrl ?? '';
  if (typeof link === 'string' && link.includes('/student/courses/')) return true;
  return false;
}

interface PendingTeacherMessages {
  messages: TeacherMessage[];
  loading: boolean;
  failed: boolean;
}

/**
 * Fetch the signed-in user's unread, NON-acknowledge teacher
 * messages — the set Worker B's pending popup never shows.
 * Never throws; a failure just yields `failed: true` (render nothing).
 */
export function usePendingTeacherMessages(): PendingTeacherMessages {
  const [messages, setMessages] = useState<TeacherMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/notifications?limit=50');
        if (!res.ok) throw new Error('notifications fetch failed');
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        const all = (Array.isArray(data?.notifications) ? data.notifications : []) as TeacherMessage[];
        setMessages(
          all.filter((n) => !n.readAt).filter((n) => n.requiresAcknowledge !== true).filter(isTeacherMessage),
        );
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { messages, loading, failed };
}

interface TeacherMessagePopupProps {
  /**
   * When given, the popup renders these messages instead of fetching.
   * This is the shared-popup-flow seam: if Worker B's popup ever
   * accepts a heading override, the coordinator can pass its
   * already-fetched pending notifications here with
   * heading="Message from Your Teacher" instead of mounting this
   * standalone host.
   */
  messages?: TeacherMessage[];
  /** Heading override — defaults to "Message from Your Teacher". */
  heading?: string;
}

/**
 * Renders the first pending teacher message as a modal popup.
 * Renders nothing while loading, when there is nothing to show, or
 * when the fetch failed.
 */
export default function TeacherMessagePopup({ messages: propMessages, heading = 'Message from Your Teacher' }: TeacherMessagePopupProps) {
  const fetched = usePendingTeacherMessages();
  const messages = propMessages ?? fetched.messages;
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const visible = messages.filter((m) => !dismissed.includes(m.id));
  const current = visible[Math.min(index, Math.max(0, visible.length - 1))] ?? null;

  const markDone = useCallback(async (msg: TeacherMessage) => {
    // Acknowledge-required messages (prop seam only) use the
    // acknowledge endpoint; everything else just marks read.
    const endpoint =
      msg.requiresAcknowledge === true
        ? `/api/notifications/${msg.id}/acknowledge`
        : `/api/notifications/${msg.id}/read`;
    try {
      await fetch(endpoint, { method: 'POST' });
    } catch {
      // Best-effort: the popup still dismisses locally so the student
      // is never trapped by a failed request.
    }
  }, []);

  const dismiss = useCallback(
    async (msg: TeacherMessage) => {
      setBusy(true);
      await markDone(msg);
      setDismissed((d) => [...d, msg.id]);
      setIndex((i) => Math.max(0, i - 1));
      setBusy(false);
    },
    [markDone],
  );

  // Never trap the user: no messages, fetch failed, or still loading
  // with nothing yet.
  if (propMessages === undefined && (fetched.loading || fetched.failed)) return null;
  if (!current) return null;

  const requiresAck = current.requiresAcknowledge === true;
  const hasMore = visible.length > 1;

  return (
    <AnimatePresence>
      <motion.div
        key={current.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        data-teacher-message-popup
      >
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={() => {
            if (!requiresAck) void dismiss(current);
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: -24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.97 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          className="relative w-full max-w-md bg-dark-card border border-primary/30 rounded-2xl elev-3 overflow-hidden"
        >
          {/* Shutter-style gold bar (same dark/gold language as the login popup). */}
          <div className="h-1.5 bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
          <div className="p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary-text flex items-center justify-center flex-shrink-0">
                <Megaphone className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-foreground">{heading}</h2>
                {current.senderName && (
                  <p className="text-muted text-xs mt-0.5">From {current.senderName}</p>
                )}
              </div>
              {!requiresAck && (
                <button
                  onClick={() => void dismiss(current)}
                  aria-label="Close"
                  className="text-muted hover:text-foreground transition-colors p-1 rounded-lg hover:bg-dark-border cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <p className="text-foreground font-medium text-sm mt-4">{current.title}</p>
            <p className="text-muted text-sm mt-1 whitespace-pre-line">{current.body}</p>
            <p className="text-muted text-xs mt-3">{formatDateShort(current.createdAt)}</p>

            <div className="flex items-center gap-2 mt-5">
              <button
                onClick={() => void dismiss(current)}
                disabled={busy}
                className="flex-1 bg-primary text-black font-semibold text-sm px-4 py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
              >
                {busy ? 'Closing…' : requiresAck ? 'Acknowledge' : 'Got it'}
              </button>
              {hasMore && (
                <button
                  onClick={() => setIndex((i) => (i + 1) % visible.length)}
                  className="px-4 py-2.5 rounded-lg border border-dark-border text-sm text-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  Next ({visible.length - index - 1} more)
                </button>
              )}
            </div>
            {requiresAck && (
              <p className="text-muted text-xs mt-3">Please acknowledge this message to continue.</p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
