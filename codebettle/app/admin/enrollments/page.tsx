import { connection } from 'next/server';
import { listEnrollments } from '@/lib/db/enrollments';
import { getUserById } from '@/lib/db/users';
import { getCourseById } from '@/lib/db/courses';
import EnrollmentsClient from './enrollments-client';
import type { Course, SafeUser } from '@/lib/db/types';

/**
 * Admin enrollments — server wrapper (Phase 2).
 * Fetches all enrollments on the server; per-row student/course lookups
 * become maps passed as props.
 */
export default async function AdminEnrollmentsPage() {
  await connection();
  const { items: enrollments } = await listEnrollments({ limit: '100' });

  const students: Record<string, SafeUser> = {};
  for (const id of [...new Set(enrollments.map((e) => e.studentId))]) {
    const student = await getUserById(id);
    if (student) students[id] = student;
  }

  const courses: Record<string, Course> = {};
  for (const id of [...new Set(enrollments.map((e) => e.courseId))]) {
    const course = await getCourseById(id);
    if (course) courses[id] = course;
  }

  return <EnrollmentsClient enrollments={enrollments} students={students} courses={courses} />;
}
