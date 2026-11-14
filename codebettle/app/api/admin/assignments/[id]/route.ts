import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, requireAdminArea } from '@/lib/api-helpers';
import {
  deleteAssignment,
  getAssignmentById,
  listSubmissionsEnriched,
} from '@/lib/db/assignments';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/assignments/[id] — one assignment with its
 * submissions (enriched with student names). DELETE — delete the
 * assignment and its submissions. Guard:
 * requireAdminArea('assignments').
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireAdminArea('assignments');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const assignment = await getAssignmentById(id);
  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  const submissions = await listSubmissionsEnriched(id);
  return NextResponse.json({ assignment, submissions });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireAdminArea('assignments');
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const { id } = await params;
  const assignment = await getAssignmentById(id);
  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  try {
    await deleteAssignment(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not delete the assignment';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not delete the assignment' }, { status: 500 });
  }
}
