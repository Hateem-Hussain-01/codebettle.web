/**
 * Audit log UI helpers (Phase 5, Module 23 — Worker C, UI).
 *
 * Pure functions only — no Next.js imports, unit-testable. The audit
 * entries themselves are loaded by the client from
 * GET /api/admin/audit (Worker B); the access lists come from
 * GET /api/admin/audit/access and the grant candidates from
 * GET /api/admin/access/users. Nothing here fabricates rows: an empty
 * log renders as an empty state, never as placeholder data.
 *
 * Note on wording: the authorized-administrator concept is access
 * control only — it is never shown as a label or badge in the UI.
 * These helpers therefore speak of "authorized" users, never of a
 * role name.
 */
import { hasAdminCapability } from '@/lib/rbac';
import type { UserRole } from '@/lib/db/types';

/** One audit entry as returned by GET /api/admin/audit (Worker B). */
export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: string | null;
  ip?: string | null;
  createdAt: string;
}

/** One person on the audit-access lists (GET /api/admin/audit/access). */
export interface AuditAccessPerson {
  id: string;
  name: string;
  email: string;
}

/** The audit-access lists: officials are always authorized; granted users were given access. */
export interface AuditAccessLists {
  officials: AuditAccessPerson[];
  granted: AuditAccessPerson[];
}

/** Filter state for the audit log table. */
export interface AuditFilters {
  /**
   * Actor filter — a user id, exact match (GET /api/admin/audit takes
   * `actor` as the actor's user id, Worker B). The client offers a
   * select of known actors (see mergeActorOptions); free text cannot
   * be honoured by the API, so there is no text search for actors.
   */
  actor: string;
  action: string;
  entity: string;
  /** Inclusive start date (YYYY-MM-DD), '' for none. */
  from: string;
  /** Inclusive end date (YYYY-MM-DD), '' for none. */
  to: string;
}

export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  actor: '',
  action: '',
  entity: '',
  from: '',
  to: '',
};

/** Rows per audit page (fixed — the API's pageSize). */
export const AUDIT_PAGE_SIZE = 50;

/**
 * Actions the app actually writes to the audit log (grep of logAudit
 * call sites). The filter dropdown offers these; an action the API
 * returns that is not in this list still renders in the table — the
 * list only limits what the dropdown can ask for.
 */
export const AUDIT_ACTIONS: readonly string[] = [
  'admin.access.revoke',
  'admin.audit-access.grant',
  'admin.audit-access.revoke',
  'admin.first-run-setup',
  'admin.invitation.accept',
  'admin.invitation.create',
  'admin.invitation.resend',
  'admin.invitation.revoke',
  'admin.notification.send',
  'admin.user.create',
  'admin.user.delete',
  'admin.user.update',
  'admin.view_as.end',
  'admin.view_as.start',
  'application.note',
  'application.onboard',
  'application.review',
  'application.stage',
  'application.submit',
  'blog.create',
  'blog.delete',
  'blog.update',
  'certificate.auto-issue',
  'certificate.issue',
  'course.create',
  'course.delete',
  'course.lesson.create',
  'course.lesson.delete',
  'course.lesson.update',
  'course.module.create',
  'course.module.delete',
  'course.module.update',
  'course.status',
  'course.update',
  'enrollment.create',
  'enrollment.delete',
  'enrollment.eligibility',
  'enrollment.update',
  'payment-account.create',
  'payment-account.delete',
  'payment-account.update',
  'payment.approve',
  'payment.reject',
  'recruitment.stage.create',
  'recruitment.stage.delete',
  'recruitment.stage.reorder',
  'recruitment.stage.update',
  'review.create',
  'review.delete',
  'support_request.create',
  'support_request.update',
  'user.change-password',
  'user.email-verified',
  'user.import',
  'user.password-reset',
  'user.register',
] as const;

/** Entities the app actually writes to the audit log (grep of logAudit call sites). */
export const AUDIT_ENTITIES: readonly string[] = [
  'application',
  'application_stage',
  'blog',
  'certificate',
  'course',
  'enrollment',
  'invitation',
  'lesson',
  'module',
  'Notification',
  'payment-account',
  'payment-submission',
  'Quiz',
  'review',
  'SupportRequest',
  'user',
] as const;

/**
 * Build the query string for GET /api/admin/audit. Only non-empty
 * filters are sent; page and pageSize are always sent.
 *
 * `to` is a calendar date and means the END of that day: the API
 * compares `createdAt <= to` as a timestamp, so a bare `YYYY-MM-DD`
 * would silently drop that day's entries after midnight. A `to` in
 * `YYYY-MM-DD` form is therefore sent as end-of-day UTC.
 */
export function buildAuditQuery(
  filters: AuditFilters,
  page: number,
  pageSize: number = AUDIT_PAGE_SIZE,
): string {
  const params = new URLSearchParams();
  const actor = filters.actor.trim();
  if (actor) params.set('actor', actor);
  if (filters.action) params.set('action', filters.action);
  if (filters.entity) params.set('entity', filters.entity);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', endOfDayIso(filters.to));
  params.set('page', String(Math.max(1, Math.floor(page) || 1)));
  params.set('pageSize', String(Math.max(1, Math.floor(pageSize) || AUDIT_PAGE_SIZE)));
  return params.toString();
}

/** `2026-11-12` -> `2026-11-12T23:59:59.999Z`; anything else passes through unchanged. */
export function endOfDayIso(date: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date.trim()) ? `${date.trim()}T23:59:59.999Z` : date;
}

/** How many pages `total` entries need at `pageSize` rows each (at least 1, so the pager never divides by zero). */
export function auditTotalPages(total: number, pageSize: number = AUDIT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
}

/** Clamp a requested page into 1..totalPages. */
export function clampAuditPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, Math.floor(page) || 1), Math.max(1, totalPages));
}

/**
 * Page numbers for the pager: every page when there are 7 or fewer,
 * otherwise 1, a window of the current page ±1, and the last page,
 * with '…' where pages are skipped. Always includes the current page.
 */
export function auditPageNumbers(page: number, totalPages: number): (number | '…')[] {
  const total = Math.max(1, totalPages);
  const current = clampAuditPage(page, total);
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('…');
    out.push(sorted[i]);
  }
  return out;
}

/**
 * May this session see the Audit Log nav item and page? The viewer
 * must be an authorized administrator OR have been granted audit
 * viewing (SessionUser.canViewAuditLog, carried by Worker A). The
 * layout and the audit page enforce the same rule server-side; this
 * predicate is the shared, testable form of it.
 */
export function canSeeAuditLog(args: {
  isAuthorizedAdmin: boolean;
  canViewAuditLog?: boolean;
}): boolean {
  return args.isAuthorizedAdmin === true || args.canViewAuditLog === true;
}

/**
 * Grant candidates for the Access & Permissions section: users with
 * admin capability who do NOT already have audit access (neither
 * always-authorized officials nor already-granted users). Accepts the
 * shape GET /api/admin/access/users returns.
 */
export function auditGrantCandidates<
  U extends { id: string; role?: UserRole; isAdmin?: boolean; isTeacher?: boolean },
>(users: readonly U[], authorizedIds: ReadonlySet<string> | readonly string[]): U[] {
  const authorized = authorizedIds instanceof Set ? authorizedIds : new Set(authorizedIds);
  return users.filter((u) => hasAdminCapability(u) && !authorized.has(u.id));
}

/** One option in the actor filter select. */
export interface AuditActorOption {
  id: string;
  name: string;
  email: string;
}

/**
 * Merge actor options for the actor filter select: deduped by id,
 * sorted by name. Sources are the users list (authorized
 * administrators only — GET /api/admin/access/users) and the actors
 * seen on loaded audit entries (every viewer). A user with no audit
 * entries yet may still be picked; the log then correctly shows
 * nothing for them.
 */
export function mergeActorOptions(
  existing: readonly AuditActorOption[],
  incoming: readonly AuditActorOption[],
): AuditActorOption[] {
  const byId = new Map<string, AuditActorOption>();
  for (const option of [...existing, ...incoming]) {
    if (!option.id) continue;
    const prev = byId.get(option.id);
    if (!prev || (!prev.name && option.name) || (!prev.email && option.email)) {
      byId.set(option.id, {
        id: option.id,
        name: option.name || prev?.name || 'Unknown actor',
        email: option.email || prev?.email || '',
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** "12 Nov 2026, 14:32" — short, readable, timezone of the viewer. */
export function formatAuditTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
