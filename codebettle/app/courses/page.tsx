import { connection } from 'next/server';
import { getPublishedCourses } from '@/lib/db/courses';
import { toPublicCourse } from '@/lib/db/mappers';
import { getUserById } from '@/lib/db/users';
import CoursesClient from './courses-client';

/**
 * Courses catalogue — server wrapper (Phase 2).
 * Fetches the published courses + instructor names on the server and
 * passes them to the client component, which keeps the interactive
 * search / filter / sort state. `await connection()` opts out of
 * build-time prerendering (this public page has no session to read).
 */
export default async function CoursesPage() {
  await connection();
  const allCourses = await getPublishedCourses();
  const instructorIds = [...new Set(allCourses.map((c) => c.instructorId))];
  const instructorNames: Record<string, string> = {};
  for (const id of instructorIds) {
    const instructor = await getUserById(id);
    instructorNames[id] = instructor?.name ?? 'Instructor';
  }
  return <CoursesClient courses={allCourses.map(toPublicCourse)} instructorNames={instructorNames} />;
}
