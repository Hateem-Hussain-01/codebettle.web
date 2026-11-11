import { getSession } from '@/lib/auth';
import { getCoursesByIds } from '@/lib/db/courses';
import { toPublicCourse } from '@/lib/db/mappers';
import { getUserById } from '@/lib/db/users';
import { listWishlistForUser } from '@/lib/db/wishlist';
import StudentWishlistClient from './student-wishlist-client';

/**
 * Student wishlist — server wrapper (Phase 0d, Module 4).
 * The wishlist is the signed-in student's own rows from the Wishlist
 * table (no hardcoded ids). The server fetches the initial entries +
 * course details; the client keeps them in sync with
 * /api/student/wishlist and removes entries through the API.
 */
export default async function StudentWishlistPage() {
  const session = await getSession();
  const items = session ? await listWishlistForUser(session.id) : [];
  const courses = await getCoursesByIds(items.map((w) => w.courseId));
  const instructorIds = [...new Set(courses.map((c) => c.instructorId))];
  const instructorNames: Record<string, string> = {};
  for (const id of instructorIds) {
    const instructor = await getUserById(id);
    instructorNames[id] = instructor?.name ?? 'Instructor';
  }
  return (
    <StudentWishlistClient
      initialItems={items.map((w) => ({ id: w.id, courseId: w.courseId }))}
      courses={courses.map(toPublicCourse)}
      instructorNames={instructorNames}
    />
  );
}
