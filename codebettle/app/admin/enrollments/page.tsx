import { connection } from 'next/server';
import { getStudents } from '@/lib/db/users';
import { getAllCourses } from '@/lib/db/courses';
import EnrollmentsClient from './enrollments-client';

/**
 * Admin enrollments — server wrapper (Phase 3).
 * The enrolment list itself is fetched client-side from
 * GET /api/admin/enrollments with real pagination. The wrapper only
 * passes the student/course pickers (small tables) for name lookups
 * and the create-enrolment form.
 */
export default async function AdminEnrollmentsPage() {
  await connection();
  const students = await getStudents();
  const courses = await getAllCourses();
  return <EnrollmentsClient students={students} courses={courses} />;
}
