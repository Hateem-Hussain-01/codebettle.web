import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, invalidBody, readJson, requireRoles } from '@/lib/api-helpers';
import { computeSubmissionStatus, validateColabUrl } from '@/lib/assignments';
import {
  createSubmission,
  getAssignmentById,
  getSubmissionByAssignmentAndStudent,
  updateSubmission,
} from '@/lib/db/assignments';
import { getEnrollmentsByStudent, isEnrolled } from '@/lib/db/enrollments';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/student/assignments/[id]/submit — submit (or resubmit) a
 * Google Colab link for an assignment. Body: { colabUrl }. The link
 * MUST be a colab.research.google.com URL — files are never accepted.
 * One submission per student per assignment: resubmitting updates the
 * link until the teacher grades it (a graded submission cannot be
 * changed). The student must be enrolled in the assignment's course
 * (and in its batch when the assignment is batch-scoped).
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  try {
    const { id } = await params;
    const assignment = await getAssignmentById(id);
    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    const enrolled = await isEnrolled(auth.session.id, assignment.courseId);
    if (!enrolled) {
      return NextResponse.json({ error: 'You are not enrolled in this course' }, { status: 403 });
    }
    if (assignment.batchId) {
      const enrollments = await getEnrollmentsByStudent(auth.session.id);
      const mine = enrollments.find((e) => e.courseId === assignment.courseId);
      if (!mine || mine.batchId !== assignment.batchId) {
        return NextResponse.json({ error: 'This assignment is for a different batch' }, { status: 403 });
      }
    }
    const body = await readJson(request);
    if (body === null) return invalidBody();
    const v = body as Record<string, unknown>;
    const colabUrl = typeof v.colabUrl === 'string' ? v.colabUrl.trim() : '';
    const error = validateColabUrl(colabUrl);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const existing = await getSubmissionByAssignmentAndStudent(id, auth.session.id);
    if (existing && existing.status === 'graded') {
      return NextResponse.json(
        { error: 'This submission has already been graded and cannot be changed.' },
        { status: 400 },
      );
    }
    const submittedAt = new Date();
    const status = computeSubmissionStatus(submittedAt, assignment.dueDate ? new Date(assignment.dueDate) : null);
    const submission = existing
      ? await updateSubmission(existing.id, { colabUrl, status, submittedAt })
      : await createSubmission({
          assignmentId: id,
          studentId: auth.session.id,
          colabUrl,
          status,
        });
    return NextResponse.json({ submission }, { status: existing ? 200 : 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not submit the assignment';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    // NEW-14: the repo layer enforces the Colab-link invariant too —
    // surface its validation error as a 400, not a 500.
    if (/Google Colab link/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Could not submit the assignment' }, { status: 500 });
  }
}
