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
}

export async function createNotification(input: CreateNotificationInput): Promise<Notification> {
  const row = await getDb().orm.public.Notification.create({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
  });
  return mapNotificationRow(row);
}

export interface ListNotificationsOptions {
  page?: string | string[];
  limit?: string | string[];
}

/** The user's notifications, newest first, paginated. */
export async function listNotificationsForUser(
  userId: string,
  opts: ListNotificationsOptions = {},
): Promise<Page<Notification>> {
  const params = parsePageParams({ page: opts.page, limit: opts.limit });
  const query = getDb().orm.public.Notification.where({ userId });
  const total = (await query.all()).length;
  const rows = await query
    .orderBy((n) => n.createdAt.desc())
    .limit(params.limit)
    .offset(params.offset)
    .all();
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
