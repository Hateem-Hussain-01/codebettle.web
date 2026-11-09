import { getCourseById } from '@/lib/db/courses';
import { getUserById } from '@/lib/db/users';
import StudentWishlistClient from './student-wishlist-client';

/**
 * Student wishlist — server wrapper (Phase 2).
 * The wishlist itself is hardcoded local state (INITIAL_WISHLIST =
 * ['course-3', 'course-5']) — kept exactly as before; the wrapper only
 * fetches the course details for those ids (and their instructor names)
 * and passes them to the client component. Remove-from-wishlist stays
 * local-only (no wishlist table exists yet).
 */
const INITIAL_WISHLIST = ['course-3', 'course-5'];

export default async function StudentWishlistPage() {
  const courses = (
    await Promise.all(INITIAL_WISHLIST.map((id) => getCourseById(id)))
  ).filter((c): c is NonNullable<typeof c> => c !== null);
  const instructorIds = [...new Set(courses.map((c) => c.instructorId))];
  const instructorNames: Record<string, string> = {};
  for (const id of instructorIds) {
    const instructor = await getUserById(id);
    instructorNames[id] = instructor?.name ?? 'Instructor';
  }
  return <StudentWishlistClient courses={courses} instructorNames={instructorNames} />;
}
