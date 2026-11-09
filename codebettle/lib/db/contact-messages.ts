/**
 * Contact-message repository (Phase 7, Prisma-backed).
 *
 * The ContactMessage model already existed in the Prisma contract
 * (migration 1) but nothing ever wrote to it — the public contact form
 * faked the send with a timeout + toast. Messages are written by the
 * public POST /api/contact route and read only by admins.
 */
import { getDb } from './client';
import { mapContactMessageRow } from './mappers';
import { parsePageParams, toPage, type Page } from './pagination';
import type { ContactMessage } from './types';

export interface CreateContactMessageInput {
  name: string;
  email: string;
  subject?: string;
  message: string;
}

export async function createContactMessage(input: CreateContactMessageInput): Promise<ContactMessage> {
  const row = await getDb().orm.public.ContactMessage.create({
    name: input.name,
    email: input.email,
    subject: input.subject ?? null,
    message: input.message,
    // Explicit (the DB also defaults it): the fake test db has no column
    // defaults, so relying on the default would leave isRead undefined.
    isRead: false,
  });
  return mapContactMessageRow(row);
}

export interface ListContactMessagesOptions {
  page?: string | string[];
  limit?: string | string[];
  unreadOnly?: boolean;
}

/** Newest first, paginated (admin inbox). */
export async function listContactMessages(
  opts: ListContactMessagesOptions = {},
): Promise<Page<ContactMessage>> {
  const params = parsePageParams({ page: opts.page, limit: opts.limit });
  let query = getDb().orm.public.ContactMessage;
  if (opts.unreadOnly) query = query.where((m) => m.isRead.eq(false));
  const total = (await query.all()).length;
  const rows = await query.orderBy((m) => m.createdAt.desc()).limit(params.limit).offset(params.offset).all();
  return toPage(rows.map(mapContactMessageRow), total, params);
}

export async function getContactMessageById(id: string): Promise<ContactMessage | null> {
  const row = await getDb().orm.public.ContactMessage.where({ id }).first();
  if (!row) return null;
  return mapContactMessageRow(row);
}

export async function markContactMessageRead(id: string, isRead: boolean): Promise<ContactMessage | null> {
  const row = await getDb().orm.public.ContactMessage.where({ id }).first();
  if (!row) return null;
  const updated = await getDb().orm.public.ContactMessage.where({ id }).update({ isRead });
  if (!updated) return null;
  return mapContactMessageRow(updated);
}

export async function deleteContactMessage(id: string): Promise<boolean> {
  const row = await getDb().orm.public.ContactMessage.where({ id }).first();
  if (!row) return false;
  await getDb().orm.public.ContactMessage.where({ id }).delete();
  return true;
}
