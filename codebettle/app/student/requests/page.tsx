import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getEnrollmentsByStudent } from '@/lib/db/enrollments';
import { getCoursesByIds } from '@/lib/db/courses';
import StudentRequestsClient from './student-requests-client';

/**
 * Student Support / Contact Admin — server wrapper (Phase 3, Worker C).
 * Student-only: the student layout already redirects non-students to
 * login; a missing session here redirects too. Enrolled courses are
 * fetched server-side (one batched query, same pattern as the student
 * dashboard) so the "related course" dropdown can only ever list
 * courses this student is enrolled in. The request list itself is
 * fetched client-side from GET /api/student/requests (Worker A).
 */
export default async function StudentRequestsPage() {
  const session = await getSession();
  if (!session) redirect('/auth/login');

  const enrollments = await getEnrollmentsByStudent(session.id);
  const coursesById = new Map(
    (await getCoursesByIds(enrollments.map((e) => e.courseId))).map((c) => [c.id, c]),
  );
  const enrolledCourses = enrollments
    .map((e) => coursesById.get(e.courseId))
    .filter((c): c is NonNullable<typeof c> => c !== undefined)
    .map((c) => ({ id: c.id, title: c.title }));

  return <StudentRequestsClient enrolledCourses={enrolledCourses} />;
}
