/**
 * Communications dashboard helpers (Phase 3, Module 14 — Worker D).
 *
 * Pure functions only — no Next.js imports, unit-testable. The dashboard
 * is a READ/AGGREGATE view over data other workers create; nothing here
 * creates a notification, an announcement or a request, and no new model
 * or store is introduced.
 *
 * Two honest limits of the underlying data, documented here so the tabs
 * do not over-claim:
 *
 * 1. A Notification row carries NO sender/author — but Phase 3 DID add
 *    `announcementId`: rows fanned out from an Announcement carry it,
 *    admin-composed targeted sends (Worker B's POST /api/admin/notifications,
 *    which writes type 'announcement' with NO announcementId) do not.
 *    So the split below is exact, not a guess:
 *    - announcementId set -> announcement delivery (tabs 1/4/5, receipts);
 *    - announcementId null + non-system type -> admin-composed targeted
 *      send (tabs 2/3). The compose page is admin-only, so targeted rows
 *      are admin-sent BY CONSTRUCTION. Teacher origin is shown where it
 *      IS knowable — the announcement's author (tabs 4–5). A teacher
 *      compose path does not exist; if one ever does, it must store a
 *      sender on the row before tab 5 can list those sends.
 *
 * 2. "Acknowledged" DOES exist on Notification rows now (Phase 3:
 *    acknowledgedAt, set by the recipient acknowledging). Delivered =
 *    row exists, read = readAt set, acknowledged = acknowledgedAt set.
 */
import type { Announcement, Notification, SafeUser } from '@/lib/db/types';

/** Delivery states, in order. Single tick = delivered, double tick = read, yellow double tick = acknowledged. */
export type DeliveryStatus = 'delivered' | 'read' | 'acknowledged';

/** Who wrote an announcement: the author's flags/role, never a guess. */
export type AnnouncementOrigin = 'admin' | 'teacher';

/** One announcement enriched with what the dashboard shows for it. */
export interface EnrichedAnnouncement {
  announcement: Announcement;
  authorName: string;
  authorIsTeacher: boolean;
  courseTitle: string | null;
  /** Site-wide: every user. Course: students enrolled in that course. */
  recipientCount: number;
  origin: AnnouncementOrigin;
}

/** One targeted notification row with its recipient attached. */
export interface TargetedRow {
  notification: Notification;
  recipientName: string;
  recipientEmail: string;
  recipientRole: 'student' | 'instructor' | 'admin';
  status: DeliveryStatus;
}

/** One recipient in a receipts response (Worker A's contract shape). Name/email are null when the user was deleted after fan-out. */
export interface ReceiptRecipient {
  userId: string;
  name: string | null;
  email: string | null;
  readAt: string | null;
  acknowledgedAt: string | null;
}

/** A receipts response (Worker A's contract shape). */
export interface ReceiptSummary {
  total: number;
  read: number;
  acknowledged: number;
  recipients: ReceiptRecipient[];
}

export interface CommunicationsStats {
  totalAnnouncements: number;
  siteWideAnnouncements: number;
  courseAnnouncements: number;
  teacherAuthoredAnnouncements: number;
  targetedSent: number;
  targetedRead: number;
}

export interface CommunicationsData {
  announcements: EnrichedAnnouncement[];
  targeted: TargetedRow[];
  stats: CommunicationsStats;
}

/** Text labels for the tick visuals (spec language, as text + icons in the UI). */
export const TICK_LABELS: Record<DeliveryStatus, { label: string; ticks: string }> = {
  delivered: { label: 'Delivered', ticks: '✓' },
  read: { label: 'Read', ticks: '✓✓' },
  acknowledged: { label: 'Acknowledged', ticks: '✓✓' },
};

/**
 * Notification types the SYSTEM creates on its own (notification-service
 * event helpers). Anything that is neither one of these nor fanned out
 * from an announcement (announcementId set) is an admin-composed
 * targeted send — Worker B's compose writes type 'announcement' with NO
 * announcementId, so type alone cannot split them; announcementId does.
 */
export const SYSTEM_NOTIFICATION_TYPES: readonly string[] = [
  'enrollment',
  'completion',
  'certificate',
  'application',
  'payment',
  'support_request',
] as const;

/** Support-request statuses that count as "open" (not terminal). */
export const OPEN_SUPPORT_REQUEST_STATUSES: readonly string[] = [
  'new',
  'under_review',
  'in_progress',
] as const;

export function isTeacherUser(user: Pick<SafeUser, 'role' | 'isTeacher'>): boolean {
  return user.isTeacher === true || user.role === 'instructor';
}

export function isStudentUser(user: Pick<SafeUser, 'role'>): boolean {
  return user.role === 'student';
}

export function announcementOrigin(author: Pick<SafeUser, 'role' | 'isTeacher'> | null | undefined): AnnouncementOrigin {
  return author && isTeacherUser(author) ? 'teacher' : 'admin';
}

/** Fanned out from an announcement: announcementId is set (Phase 3). Admin-composed sends have none. */
export function isAnnouncementNotification(
  notification: Pick<Notification, 'type' | 'announcementId'>,
): boolean {
  return notification.announcementId !== null && notification.announcementId !== undefined;
}

export function isSystemNotification(notification: Pick<Notification, 'type'>): boolean {
  return (SYSTEM_NOTIFICATION_TYPES as readonly string[]).includes(notification.type);
}

/** A targeted send: not an announcement delivery and not a system event. */
export function isTargetedNotification(
  notification: Pick<Notification, 'type' | 'announcementId'>,
): boolean {
  return !isAnnouncementNotification(notification) && !isSystemNotification(notification);
}

/** Acknowledged beats read beats delivered (Phase 3: acknowledgedAt on the row). */
export function deliveryStatusOf(
  notification: Pick<Notification, 'readAt' | 'acknowledgedAt'>,
): DeliveryStatus {
  if (notification.acknowledgedAt) return 'acknowledged';
  if (notification.readAt) return 'read';
  return 'delivered';
}

/** Receipt status from Worker A's receipts shape: acknowledged beats read beats delivered. */
export function receiptStatusOf(recipient: Pick<ReceiptRecipient, 'readAt' | 'acknowledgedAt'>): DeliveryStatus {
  if (recipient.acknowledgedAt) return 'acknowledged';
  if (recipient.readAt) return 'read';
  return 'delivered';
}

/** Counts for a receipts response. `total` is the recipient count the endpoint reports. */
export function computeReceiptSummary(summary: Pick<ReceiptSummary, 'total' | 'recipients'>): {
  total: number;
  read: number;
  acknowledged: number;
  delivered: number;
} {
  const read = summary.recipients.filter((r) => r.readAt).length;
  const acknowledged = summary.recipients.filter((r) => r.acknowledgedAt).length;
  return {
    total: summary.total,
    read,
    acknowledged,
    delivered: Math.max(0, summary.total - read),
  };
}

/** Read rate as a whole-number percent, or null when there is nothing to rate. */
export function readRate(read: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((read / total) * 100);
}

export interface RequestSummaryInput {
  status?: string | null;
  category?: string | null;
}

/** Summary counts for the requests tab, from Worker C's GET /api/admin/requests shape. */
export function summariseRequests(requests: RequestSummaryInput[]): {
  total: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
} {
  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const request of requests) {
    const status = (request.status ?? 'unknown').toLowerCase();
    const category = (request.category ?? 'Uncategorised').trim() || 'Uncategorised';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    byCategory[category] = (byCategory[category] ?? 0) + 1;
  }
  return { total: requests.length, byStatus, byCategory };
}

/** Case-insensitive substring match across the given fields. Empty query matches everything. */
export function matchesQuery(fields: (string | null | undefined)[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => (f ?? '').toLowerCase().includes(q));
}
