import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, requireFullAdmin } from '@/lib/api-helpers';
import { deleteSuccessStory } from '@/lib/services/success-story-service';
import { updateSuccessStorySubmission } from '@/lib/db/success-stories';

/**
 * PATCH /api/admin/success-stories-management/stories/[id] — story
 * visibility + ordering from the management tab: { enabled?,
 * displayOrder?, featured? }. Guard:
 * requireAdminArea('success-stories-management'). (Status review
 * stays in the existing /api/admin/success-stories/[id] route.)
 *
 * DELETE — remove a story. Guard: requireFullAdmin (destructive, same
 * rule as the existing story route).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('success-stories-management');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const v = body as Record<string, unknown>;
  const patch: { enabled?: boolean; displayOrder?: number; featured?: boolean } = {};
  if (typeof v.enabled === 'boolean') patch.enabled = v.enabled;
  if (typeof v.displayOrder === 'number' && Number.isInteger(v.displayOrder) && v.displayOrder >= 0) {
    patch.displayOrder = v.displayOrder;
  } else if (v.displayOrder !== undefined) {
    return NextResponse.json({ error: 'Display order must be a whole number of 0 or more' }, { status: 400 });
  }
  if (typeof v.featured === 'boolean') patch.featured = v.featured;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No story settings provided' }, { status: 400 });
  }
  try {
    const updated = await updateSuccessStorySubmission(id, patch);
    if (!updated) return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    return NextResponse.json({ submission: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not update the story';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not update the story' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireFullAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  try {
    const deleted = await deleteSuccessStory(id);
    if (!deleted) return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not delete the story';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not delete the story' }, { status: 500 });
  }
}
