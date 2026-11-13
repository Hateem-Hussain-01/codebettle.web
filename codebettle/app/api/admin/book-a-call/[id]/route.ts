import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import { deleteBookACall, updateBookACallStatus } from '@/lib/db/book-a-call';

/** PATCH /api/admin/book-a-call/[id] — change a request's status (admin only). Body: { status: 'new' | 'contacted' | 'done' }. */
const patchSchema = z.object({ status: z.enum(['new', 'contacted', 'done']) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('book-a-call');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return invalidBody('status is required');
  const updated = await updateBookACallStatus(id, parsed.data.status);
  if (!updated) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  return NextResponse.json({ booking: updated });
}

/** DELETE /api/admin/book-a-call/[id] — delete a request (admin only). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('book-a-call');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const removed = await deleteBookACall(id);
  if (!removed) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
