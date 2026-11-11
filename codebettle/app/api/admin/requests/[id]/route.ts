import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { z } from 'zod';
import { getSupportRequestById } from '@/lib/db/support-requests';
import { updateSupportRequestService } from '@/lib/services/support-request-service';

/**
 * GET /api/admin/requests/[id] — full detail of one support request
 * (Phase 3, admin only).
 * PATCH /api/admin/requests/[id] — triage it. Body: { status?,
 * adminReply? } where status is new | under_review | in_progress |
 * resolved | rejected. Moving to resolved/rejected stamps
 * resolvedBy/resolvedAt; moving back out clears them. A status
 * change — or a new admin reply — notifies the student
 * (best-effort). Same 'messages' area guard as the list route (see
 * app/api/admin/requests/route.ts).
 */
const patchSchema = z.object({
  status: z.enum(['new', 'under_review', 'in_progress', 'resolved', 'rejected']).optional(),
  adminReply: z.string().max(5000).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('requests');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const requestRow = await getSupportRequestById(id);
  if (!requestRow) {
    return NextResponse.json({ error: 'Support request not found' }, { status: 404 });
  }
  return NextResponse.json({ request: requestRow });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('requests');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid update' },
      { status: 400 },
    );
  }
  const result = await updateSupportRequestService(auth.session, id, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ request: result.request });
}
