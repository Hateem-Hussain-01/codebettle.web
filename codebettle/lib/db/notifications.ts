/**
 * Notification repository (Phase 4, Prisma-backed).
 *
 * In-app notifications live in the Notification table. Every read/write
 * is scoped to one userId — a user can only ever see, mark or delete
 * their own rows. Ownership is enforced here (userId in the where
 * clause), so a caller that passes another user's id gets null/false,
 * never the row.
 */
import { getDb } from './client';
import { mapNotificationRow } from './mappers';
import { parsePageParams, toPage, type Page } from './pagination';
import type { Notification } from './types';

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  /** Phase 3: general | important | warning | special_notice (default general). */
  category?: string;
  /** Phase 3: the Announcement this row was fanned out from. */
  announcementId?: string;
  /** Phase 3: optional deep link. */
  linkUrl?: string;
  /** Phase 3: true when the user must acknowledge this notification. */
  requiresAcknowledge?: boolean;
}

export async function createNotification(input: CreateNotificationInput): Promise<Notification> {
  const row = await getDb().orm.public.Notification.create({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    category: input.category ?? 'general',
    announcementId: input.announcementId ?? null,
    linkUrl: input.linkUrl ?? null,
    requiresAcknowledge: input.requiresAcknowledge ?? false,
  });
  return mapNotificationRow(row);
}

export interface ListNotificationsOptions {
  page?: string | string[];
  limit?: string | string[];
  /** Filter by notification type (e.g. 'announcement'). */
  type?: string;
  /** Phase 3: filter by category (general | important | warning | special_notice). */
  category?: string;
  /**
   * Phase 3: when true, return ONLY notifications with
   * requiresAcknowledge=true that have NOT been acknowledged yet,
   * oldest first (the login acknowledge popup).
   * Phase 7: acknowledgement — not read state — is the gate. Marking
   * an ack-required notification read (card click, Mark All Read)
   * must NOT silently discharge it: it stays pending until
   * acknowledgedAt is set, so the login popup shows it again.
   * Non-ack notifications never appear here, read or unread.
   */
  pending?: boolean;
}

/** The user's notifications, newest first, paginated. */
export async function listNotificationsForUser(
  userId: string,
  opts: ListNotificationsOptions = {},
): Promise<Page<Notification>> {
  const params = parsePageParams({ page: opts.page, limit: opts.limit });
  let query = getDb().orm.public.Notification.where({ userId });
  if (opts.type) query = query.where({ type: opts.type });
  if (opts.category) query = query.where({ category: opts.category });
  if (opts.pending) {
    // Phase 7: pending = requires acknowledgement AND not yet
    // acknowledged, regardless of readAt. A read-but-unacknowledged
    // row stays pending so the login popup re-shows it.
    query = query
      .where((n) => n.acknowledgedAt.isNull())
      .where((n) => n.requiresAcknowledge.eq(true));
  }
  const total = (await query.all()).length;
  const ordered = opts.pending
    ? query.orderBy((n) => n.createdAt.asc())
    : query.orderBy((n) => n.createdAt.desc());
  const rows = await ordered.limit(params.limit).offset(params.offset).all();
  return toPage(rows.map(mapNotificationRow), total, params);
}

/** One notification, only when it belongs to this user (null otherwise). */
export async function getNotificationForUser(
  userId: string,
  id: string,
): Promise<Notification | null> {
  const row = await getDb()
    .orm.public.Notification.where({ id, userId })
    .first();
  if (!row) return null;
  return mapNotificationRow(row);
}

export async function getUnreadCount(userId: string): Promise<number> {
  const rows = await getDb()
    .orm.public.Notification.where({ userId })
    .where((n) => n.readAt.isNull())
    .all();
  return rows.length;
}

/** Mark one notification read. Only the owner's row; null when not found / not own. */
export async function markNotificationRead(
  userId: string,
  id: string,
): Promise<Notification | null> {
  const row = await getDb()
    .orm.public.Notification.where({ id, userId })
    .where((n) => n.readAt.isNull())
    .update({ readAt: new Date() });
  if (!row) {
    // Either missing/not own, or already read — return the row as-is
    // when it exists so callers can tell "already read" from "not found".
    return getNotificationForUser(userId, id);
  }
  return mapNotificationRow(row);
}

/** Mark every unread notification of this user read. Returns how many were marked. */
export async function markAllRead(userId: string): Promise<number> {
  const updated = await getDb()
    .orm.public.Notification.where({ userId })
    .where((n) => n.readAt.isNull())
    .updateAll({ readAt: new Date() });
  return updated.length;
}

/** Delete one notification. Only the owner's row; false when not found / not own. */
export async function deleteNotification(userId: string, id: string): Promise<boolean> {
  const row = await getDb()
    .orm.public.Notification.where({ id, userId })
    .delete();
  return row !== null;
}

/**
 * Acknowledge one notification (Phase 3). Only the owner's row; null
 * when not found / not own. Idempotent: acknowledging again returns
 * the same row with the original acknowledgedAt — the first
 * acknowledgement is never overwritten. Sets readAt too when it is
 * still null (acknowledging implies reading).
 */
export async function acknowledgeNotification(
  userId: string,
  id: string,
): Promise<Notification | null> {
  const existing = await getNotificationForUser(userId, id);
  if (!existing) return null;
  if (existing.acknowledgedAt) return existing;
  const now = new Date();
  const row = await getDb()
    .orm.public.Notification.where({ id, userId })
    .update({ acknowledgedAt: now, readAt: now });
  if (!row) return existing;
  return mapNotificationRow(row);
}

/** Every notification row fanned out from one announcement (receipts). */
export async function listNotificationsByAnnouncement(
  announcementId: string,
): Promise<Notification[]> {
  const rows = await getDb()
    .orm.public.Notification.where({ announcementId })
    .orderBy((n) => n.createdAt.asc())
    .all();
  return rows.map(mapNotificationRow);
}

/**
 * Phase 7: does this user already have a notification fanned out from
 * this announcement? notifyUser uses this to dedupe a retried or
 * double publish — one row per (userId, announcementId).
 */
export async function notificationExistsForAnnouncement(
  userId: string,
  announcementId: string,
): Promise<boolean> {
  const row = await getDb()
    .orm.public.Notification.where({ userId, announcementId })
    .first();
  return row !== null;
}
