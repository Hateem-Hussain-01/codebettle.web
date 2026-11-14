import { NextRequest, NextResponse } from 'next/server';
import { requireRoles } from '@/lib/api-helpers';
import { canManageAssignment } from '@/lib/assignment-access';
import { getAssignmentById, listSubmissionsEnriched } from '@/lib/db/assignments';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/instructor/assignments/[id]/submissions — all submissions
 * for one assignment, enriched with student names/emails and the
 * late flag. Guard: requireRoles(['instructor']); the teacher must
 * teach the assignment's course (admins may view any assignment).
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireRoles(['instructor']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const assignment = await getAssignmentById(id);
  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  if (!(await canManageAssignment(auth.session, assignment))) {
    return NextResponse.json({ error: 'You can only view submissions for your own courses' }, { status: 403 });
  }
  const submissions = await listSubmissionsEnriched(id);
  return NextResponse.json({ assignment, submissions });
}
