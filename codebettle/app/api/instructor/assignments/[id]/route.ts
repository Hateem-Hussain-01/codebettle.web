import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, invalidBody, readJson, requireRoles } from '@/lib/api-helpers';
import { validateAssignment } from '@/lib/assignments';
import { canManageAssignment } from '@/lib/assignment-access';
import {
  deleteAssignment,
  getAssignmentById,
  listSubmissionsEnriched,
  updateAssignment,
} from '@/lib/db/assignments';
import { getBatchesByCourse } from '@/lib/db/batches';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/instructor/assignments/[id] — one assignment with its
 * submissions (enriched with student names). PATCH — edit the
 * assignment. DELETE — delete the assignment and its submissions.
 * Guard: requireRoles(['instructor', 'admin']); the teacher must teach the
 * assignment's course (admins may manage any assignment).
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireRoles(['instructor', 'admin']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const assignment = await getAssignmentById(id);
  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  if (!(await canManageAssignment(auth.session, assignment))) {
    return NextResponse.json({ error: 'You can only view assignments for your own courses' }, { status: 403 });
  }
  const submissions = await listSubmissionsEnriched(id);
  return NextResponse.json({ assignment, submissions });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireRoles(['instructor', 'admin']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  try {
    const { id } = await params;
    const assignment = await getAssignmentById(id);
    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    if (!(await canManageAssignment(auth.session, assignment))) {
      return NextResponse.json({ error: 'You can only edit assignments for your own courses' }, { status: 403 });
    }
    const body = await readJson(request);
    if (body === null) return invalidBody();
    const v = body as Record<string, unknown>;
    const input = {
      title: typeof v.title === 'string' ? v.title.trim() : assignment.title,
      description: typeof v.description === 'string' ? v.description.trim() : assignment.description,
      batchId:
        typeof v.batchId === 'string'
          ? v.batchId.length > 0
            ? v.batchId
            : null
          : assignment.batchId,
      dueDate:
        typeof v.dueDate === 'string' && v.dueDate.length > 0
          ? v.dueDate
          : v.dueDate === null
            ? null
            : assignment.dueDate,
      maxMarks: typeof v.maxMarks === 'number' ? v.maxMarks : assignment.maxMarks,
    };
    const error = validateAssignment({ ...input, courseId: assignment.courseId });
    if (error) return NextResponse.json({ error }, { status: 400 });
    if (input.batchId) {
      const batches = await getBatchesByCourse(assignment.courseId);
      if (!batches.some((b) => b.id === input.batchId)) {
        return NextResponse.json({ error: 'Batch not found for this course' }, { status: 400 });
      }
    }
    const updated = await updateAssignment(id, {
      title: input.title,
      description: input.description,
      batchId: input.batchId,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      maxMarks: input.maxMarks,
    });
    return NextResponse.json({ assignment: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not update the assignment';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not update the assignment' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireRoles(['instructor', 'admin']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const { id } = await params;
  const assignment = await getAssignmentById(id);
  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  if (!(await canManageAssignment(auth.session, assignment))) {
    return NextResponse.json({ error: 'You can only delete assignments for your own courses' }, { status: 403 });
  }
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
