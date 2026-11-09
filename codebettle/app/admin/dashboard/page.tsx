import { connection } from 'next/server';
import { getAllUsers, getInstructors, getStudents } from '@/lib/db/users';
import { getAllCourses } from '@/lib/db/courses';
import { listEnrollments } from '@/lib/db/enrollments';
import DashboardClient from './dashboard-client';

/**
 * Admin dashboard — server wrapper (Phase 2).
 * Fetches students, instructors, courses and enrollments on the server
 * and passes them to the client component, which keeps the charts and
 * recent-enrollments table. listEnrollments returns newest first, so
 * the first 6 rows are the recent enrollments.
 */
export default async function AdminDashboard() {
  await connection();
  const [users, students, instructors, courses, enrollmentPage] = await Promise.all([
    getAllUsers(),
    getStudents(),
    getInstructors(),
    getAllCourses(),
    listEnrollments({ limit: '100' }),
  ]);
  return (
    <DashboardClient
      users={users}
      students={students}
      instructors={instructors}
      courses={courses}
      enrollments={enrollmentPage.items}
    />
  );
}
