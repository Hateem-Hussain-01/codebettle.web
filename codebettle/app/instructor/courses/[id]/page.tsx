import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getBatchesByCourse } from '@/lib/db/batches';
import { getEnrollmentsByCourse } from '@/lib/db/enrollments';
import { getUserById } from '@/lib/db/users';
import { loadCourseForEdit } from '@/lib/services/course-service';
import InstructorCourseManageClient from './instructor-course-manage-client';

/**
 * Instructor course management — server wrapper (Phase 2).
 * Fetches the course and its enrolled students on the server and passes
 * them to the client component. Local edits (zoom link, recordings,
 * curriculum, mark complete) stay local-only (Phase 3 builds the write APIs).
 *
 * SECURITY (INST-01): this page renders the course's Zoom link and lesson
 * recording URLs — privileged data stripped from the public course API.
 * The layout only checks "is a teacher"; this page also enforces the
 * same ownership rule as the write endpoints (loadCourseForEdit): an
 * instructor may open ONLY courses they teach; an admin may open any
 * course. A missing course and a course the instructor does not own
 * both 404 (existence is not confirmed to a non-owner).
 */
export default async function InstructorCourseManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();
  const allowed = await loadCourseForEdit(session, id);
  if ('error' in allowed) notFound();
  const course = allowed.course;

  const enrollments = await getEnrollmentsByCourse(id);
  const enrolledStudents = (
    await Promise.all(
      enrollments.map(async (e) => ({ enrollment: e, student: await getUserById(e.studentId) })),
    )
  ).filter((item): item is { enrollment: typeof item.enrollment; student: NonNullable<typeof item.student> } => item.student !== null);

  // Batches of this course (for the per-student batch label). Empty when
  // the Batch table has not been created yet.
  const batches = await getBatchesByCourse(id);

  return <InstructorCourseManageClient course={course} enrolledStudents={enrolledStudents} batches={batches} />;
}
