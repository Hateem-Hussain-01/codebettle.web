import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { deleteSubscriber } from '@/lib/db/subscribers';

/** DELETE /api/admin/subscribers/[id] — unsubscribe (delete) a subscriber (admin only). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('subscribers');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const removed = await deleteSubscriber(id);
  if (!removed) return NextResponse.json({ error: 'Subscriber not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
