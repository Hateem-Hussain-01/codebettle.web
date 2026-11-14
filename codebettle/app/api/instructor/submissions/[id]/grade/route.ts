import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, invalidBody, readJson, requireRoles } from '@/lib/api-helpers';
import { validateGrade } from '@/lib/assignments';
import { canManageAssignment } from '@/lib/assignment-access';
import { getAssignmentById, getSubmissionById, gradeSubmission } from '@/lib/db/assignments';

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/instructor/submissions/[id]/grade — grade a submission
 * (marks + optional feedback). Sets status to 'graded' with the
 * grading time and teacher. Guard: requireRoles(['instructor',
 * 'admin']); the teacher must teach the assignment's course (admins
 * may grade any submission).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireRoles(['instructor', 'admin']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  try {
    const { id } = await params;
    const submission = await getSubmissionById(id);
    if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    const assignment = await getAssignmentById(submission.assignmentId);
    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    if (!(await canManageAssignment(auth.session, assignment))) {
      return NextResponse.json({ error: 'You can only grade submissions for your own courses' }, { status: 403 });
    }
    const body = await readJson(request);
    if (body === null) return invalidBody();
    const v = body as Record<string, unknown>;
    const marks = typeof v.marks === 'number' ? v.marks : NaN;
    const feedback = typeof v.feedback === 'string' ? v.feedback : null;
    const error = validateGrade(marks, assignment.maxMarks);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const graded = await gradeSubmission(id, {
      marks,
      feedback,
      gradedBy: auth.session.id,
    });
    return NextResponse.json({ submission: graded });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not grade the submission';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not grade the submission' }, { status: 500 });
  }
}
