import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireRoles } from '@/lib/api-helpers';
import { createAmbassadorMessage, getAmbassadorByUserId } from '@/lib/db/ambassadors';

/**
 * POST /api/student/ambassador/messages — an ambassador sends a
 * message to the admin (one-way, no reply thread in v1).
 *
 * The ambassador is resolved from the session user id, so a caller
 * can only ever send AS themselves — the ambassador id is never
 * taken from the request. Non-ambassadors get 404. Message text
 * only, 1–2000 chars.
 */
const postSchema = z.object({
  message: z.string().min(1).max(2000),
});

export async function POST(request: NextRequest) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return invalidBody('message is required (1–2000 characters)');
  const ambassador = await getAmbassadorByUserId(auth.session.id);
  if (!ambassador || ambassador.status !== 'active') {
    return NextResponse.json({ error: 'You are not an ambassador' }, { status: 404 });
  }
  const created = await createAmbassadorMessage(ambassador.id, parsed.data.message.trim());
  return NextResponse.json({ message: created }, { status: 201 });
}
