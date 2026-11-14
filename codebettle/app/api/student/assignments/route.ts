import { NextResponse } from 'next/server';
import { requireRoles } from '@/lib/api-helpers';
import {
  areAssignmentTablesReady,
  listAssignmentsByCourseIds,
  listSubmissionsByStudent,
} from '@/lib/db/assignments';
import { getEnrollmentsByStudent } from '@/lib/db/enrollments';
import { getCoursesByIds } from '@/lib/db/courses';

/**
 * GET /api/student/assignments — the assignments for the student's
 * enrolled courses, each with the student's own submission (if any).
 * A batch-scoped assignment shows only to students enrolled in that
 * batch; a course-wide assignment shows to every enrolled student.
 * Also returns `tablesReady` so the UI can show a "run the SQL" state
 * when the migration has not run yet.
 */
export async function GET() {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const [tablesReady, enrollments] = await Promise.all([
    areAssignmentTablesReady(),
    getEnrollmentsByStudent(auth.session.id),
  ]);
  const batchByCourse = new Map(enrollments.map((e) => [e.courseId, e.batchId ?? null]));
  const courseIds = [...batchByCourse.keys()];
  const all = await listAssignmentsByCourseIds(courseIds);
  // Batch scope: a batch-scoped assignment is visible only to students
  // enrolled in that batch of the course.
  const visible = all.filter(
    (a) => !a.batchId || batchByCourse.get(a.courseId) === a.batchId,
  );
  const [mySubmissions, courses] = await Promise.all([
    listSubmissionsByStudent(auth.session.id),
    getCoursesByIds(courseIds),
  ]);
  const courseTitle = new Map(courses.map((c) => [c.id, c.title]));
  const submissionByAssignment = new Map(mySubmissions.map((s) => [s.assignmentId, s]));
  const assignments = visible.map((a) => ({
    ...a,
    courseTitle: courseTitle.get(a.courseId),
    mySubmission: submissionByAssignment.get(a.id) ?? null,
  }));
  return NextResponse.json({ assignments, tablesReady });
}
