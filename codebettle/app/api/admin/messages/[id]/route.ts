import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import { deleteContactMessage, markContactMessageRead } from '@/lib/db/contact-messages';

/** PATCH /api/admin/messages/[id] — mark a message read/unread (admin only). Body: { isRead: boolean }. */
const patchSchema = z.object({ isRead: z.boolean() });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('messages');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return invalidBody('isRead is required');
  const updated = await markContactMessageRead(id, parsed.data.isRead);
  if (!updated) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  return NextResponse.json({ message: updated });
}

/** DELETE /api/admin/messages/[id] — delete a message (admin only). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('messages');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const removed = await deleteContactMessage(id);
  if (!removed) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
