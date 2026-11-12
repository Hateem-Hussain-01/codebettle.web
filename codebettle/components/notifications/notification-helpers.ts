/**
 * Notification UI helpers (Phase 3, Worker B).
 *
 * Pure functions shared by the login popup, the notifications list and
 * the admin compose form. No Next.js imports — unit-testable.
 *
 * Defensive by design: Worker A is adding `category`, `linkUrl`,
 * `requiresAcknowledge`, `acknowledgedAt` and `senderName` to the
 * notification rows/APIs in parallel. Until that lands (or when the
 * migration has not been run), those fields may be missing at runtime —
 * every helper here treats a missing category as 'general' and a
 * missing requiresAcknowledge as false, so the UI keeps working on the
 * old shape.
 */

export type NotificationCategory = 'general' | 'important' | 'warning' | 'special_notice';

/** A notification row as the UI sees it — new fields are optional. */
export interface PendingNotification {
  id: string;
  type: string;
  category?: string | null;
  title: string;
  body: string;
  linkUrl?: string | null;
  requiresAcknowledge?: boolean | null;
  acknowledgedAt?: string | null;
  readAt?: string | null;
  createdAt: string;
  senderName?: string | null;
}

/** Normalise any stored category value; unknown/missing -> 'general'. */
export function normaliseCategory(value: unknown): NotificationCategory {
  if (value === 'important' || value === 'warning' || value === 'special_notice') return value;
  return 'general';
}

/**
 * Popup heading for a category. Returns null when the notification's
 * own title should be used as the heading (general announcements).
 */
export function headingForCategory(category: unknown): string | null {
  switch (normaliseCategory(category)) {
    case 'important':
      return 'Important Notice';
    case 'special_notice':
      return 'Special Notification';
    case 'warning':
      return 'Warning';
    default:
      return null;
  }
}

/** Short label for a category chip on the notifications list. */
export function categoryLabel(category: unknown): string {
  switch (normaliseCategory(category)) {
    case 'important':
      return 'Important';
    case 'special_notice':
      return 'Special Notice';
    case 'warning':
      return 'Warning';
    default:
      return 'General';
  }
}

/** Whether this notification must be acknowledged before proceeding. */
export function needsAcknowledgement(n: PendingNotification): boolean {
  return n.requiresAcknowledge === true && !n.acknowledgedAt;
}

/** Compose-form default for "Requires acknowledgement" per category. */
export function defaultRequiresAcknowledge(category: unknown): boolean {
  const c = normaliseCategory(category);
  return c === 'important' || c === 'special_notice';
}

/** "12 Nov 2026, 09:41" style date+time for the popup. */
export function formatNotificationDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-PK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Query string for GET /api/notifications with the list filters. */
export function buildNotificationsQuery(opts: {
  type?: string;
  category?: string;
  page?: number;
  limit?: number;
}): string {
  const params = new URLSearchParams();
  if (opts.type) params.set('type', opts.type);
  if (opts.category) params.set('category', opts.category);
  if (opts.page !== undefined) params.set('page', String(opts.page));
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return qs ? `/api/notifications?${qs}` : '/api/notifications';
}

// ---------------------------------------------------------------------------
// Admin compose form
// ---------------------------------------------------------------------------

export type ComposeTargetType = 'all' | 'role' | 'user' | 'course';
export type ComposeRole = 'student' | 'instructor' | 'admin';

export interface ComposeFormState {
  title: string;
  body: string;
  /** Stored category value sent to the API. */
  category: NotificationCategory;
  targetType: ComposeTargetType;
  /** For targetType 'role'. */
  role: ComposeRole;
  /** For targetType 'user' — the picked user's id. */
  userId: string;
  /** For targetType 'course'. */
  courseId: string;
  requiresAcknowledge: boolean;
  linkUrl: string;
}

export const COMPOSE_CATEGORIES: { value: NotificationCategory; label: string }[] = [
  { value: 'general', label: 'General Announcement' },
  { value: 'important', label: 'Important Notification' },
  { value: 'warning', label: 'Warning' },
  { value: 'special_notice', label: 'Special Notice' },
];

/**
 * Validate a compose form and build the POST /api/admin/notifications
 * body. Returns { ok: false, error } with a human-readable message when
 * the form is incomplete — the server still validates everything again;
 * this is only the client-side check.
 */
export function buildComposePayload(
  form: ComposeFormState,
): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  const title = form.title.trim();
  const body = form.body.trim();
  if (!title) return { ok: false, error: 'Title is required' };
  if (!body) return { ok: false, error: 'Message is required' };

  const target: Record<string, unknown> = {};
  if (form.targetType === 'all') {
    target.type = 'all';
  } else if (form.targetType === 'role') {
    target.type = 'role';
    target.role = form.role;
  } else if (form.targetType === 'user') {
    if (!form.userId) return { ok: false, error: 'Pick a user to send this to' };
    target.type = 'user';
    target.userId = form.userId;
  } else if (form.targetType === 'course') {
    if (!form.courseId) return { ok: false, error: 'Pick a course to send this to' };
    target.type = 'course';
    target.courseId = form.courseId;
  } else {
    return { ok: false, error: 'Pick who this notification goes to' };
  }

  const payload: Record<string, unknown> = {
    title,
    body,
    category: normaliseCategory(form.category),
    target,
    requiresAcknowledge: form.requiresAcknowledge,
  };
  const linkUrl = form.linkUrl.trim();
  if (linkUrl) payload.linkUrl = linkUrl;
  return { ok: true, body: payload };
}
