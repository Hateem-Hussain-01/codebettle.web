import { connection } from 'next/server';
import { getAllCourses } from '@/lib/db/courses';
import { getUserById } from '@/lib/db/users';
import CoursesClient from './courses-client';

/**
 * Admin courses — server wrapper (Phase 2).
 * Fetches all courses + instructor names on the server and passes them
 * to the client component, which keeps the local search/filter and
 * status/featured/delete state.
 */
export default async function AdminCoursesPage() {
  await connection();
  const allCourses = await getAllCourses();
  const instructorIds = [...new Set(allCourses.map((c) => c.instructorId))];
  const instructorNames: Record<string, string> = {};
  for (const id of instructorIds) {
    const instructor = await getUserById(id);
    instructorNames[id] = instructor?.name ?? 'Instructor';
  }
  return <CoursesClient courses={allCourses} instructorNames={instructorNames} />;
}
