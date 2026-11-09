import { connection } from 'next/server';
import { getInstructors } from '@/lib/db/users';
import NewCourseClient from './new-course-client';

/**
 * Admin create-course — server wrapper (Phase 2).
 * Fetches the instructors on the server and passes them to the client
 * component, which keeps the whole form state. Saving stays local-only
 * until Phase 3 builds the real course write API.
 */
export default async function AdminCreateCoursePage() {
  await connection();
  const instructors = await getInstructors();
  return <NewCourseClient instructors={instructors} />;
}
