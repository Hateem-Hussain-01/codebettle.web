import { notFound } from 'next/navigation';
import { getCourseById } from '@/lib/db/courses';
import { getEnrollmentsByCourse } from '@/lib/db/enrollments';
import { getUserById } from '@/lib/db/users';
import InstructorCourseManageClient from './instructor-course-manage-client';

/**
 * Instructor course management — server wrapper (Phase 2).
 * Fetches the course and its enrolled students on the server and passes
 * them to the client component. Local edits (zoom link, recordings,
 * curriculum, mark complete) stay local-only (Phase 3 builds the write APIs).
 */
export default async function InstructorCourseManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const course = await getCourseById(id);
  if (!course) notFound();

  const enrollments = await getEnrollmentsByCourse(id);
  const enrolledStudents = (
    await Promise.all(
      enrollments.map(async (e) => ({ enrollment: e, student: await getUserById(e.studentId) })),
    )
  ).filter((item): item is { enrollment: typeof item.enrollment; student: NonNullable<typeof item.student> } => item.student !== null);

  return <InstructorCourseManageClient course={course} enrolledStudents={enrolledStudents} />;
}
