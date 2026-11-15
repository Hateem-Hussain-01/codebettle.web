import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import { markAmbassadorMessageRead } from '@/lib/db/ambassadors';

/**
 * PATCH /api/admin/ambassadors/messages/[id] — mark an ambassador's
 * message read (admin only). Body: { read: true }.
 */
const patchSchema = z.object({ read: z.literal(true) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('ambassadors');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return invalidBody('read: true is required');
  const updated = await markAmbassadorMessageRead(id);
  if (!updated) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  return NextResponse.json({ message: updated });
}
