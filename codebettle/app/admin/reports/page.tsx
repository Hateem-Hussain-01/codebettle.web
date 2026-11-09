import { connection } from 'next/server';
import { getAllUsers, getStudents } from '@/lib/db/users';
import { getAllCourses } from '@/lib/db/courses';
import { listEnrollments } from '@/lib/db/enrollments';
import ReportsClient from './reports-client';

/**
 * Admin reports — server wrapper (Phase 2).
 * Fetches students, users, courses and enrollments on the server and
 * passes them to the client component, which keeps the CSV export
 * handlers (they run in the browser).
 */
export default async function AdminReportsPage() {
  await connection();
  const [students, users, courses, enrollmentPage] = await Promise.all([
    getStudents(),
    getAllUsers(),
    getAllCourses(),
    listEnrollments({ limit: '100' }),
  ]);
  return (
    <ReportsClient
      students={students}
      users={users}
      courses={courses}
      enrollments={enrollmentPage.items}
    />
  );
}
