import { getSession } from '@/lib/auth';
import { getCoursesByInstructor } from '@/lib/db/courses';
import InstructorResourcesClient from './instructor-resources-client';

/**
 * Instructor resource library — server wrapper (Phase 2).
 * Fetches the instructor's courses on the server and passes them to the
 * client component. The resource list itself is local state seeded from a
 * hardcoded list (no resource table exists yet); adds/deletes stay local-only.
 */
export default async function InstructorResourcesPage() {
  const session = await getSession();
  const myCourses = await getCoursesByInstructor(session!.id);
  return <InstructorResourcesClient courses={myCourses} />;
}
