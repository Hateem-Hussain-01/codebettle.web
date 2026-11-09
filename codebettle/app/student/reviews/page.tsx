import { getSession } from '@/lib/auth';
import { getReviewsByStudent } from '@/lib/db/reviews';
import { getCourseById, getPublishedCourses } from '@/lib/db/courses';
import StudentReviewsClient from './student-reviews-client';

/**
 * Student reviews — server wrapper (Phase 2).
 * Fetches the logged-in student's reviews, the published courses (for the
 * write-a-review dropdown) and the reviewed courses on the server and
 * passes them to the client component. Submit/delete stay local-only
 * (Phase 3 builds the real write API).
 */
export default async function StudentReviewsPage() {
  const session = await getSession();
  const myReviews = await getReviewsByStudent(session!.id);
  const publishedCourses = await getPublishedCourses();
  const courseIds = [...new Set(myReviews.map((r) => r.courseId))];
  const coursesById: Record<string, NonNullable<Awaited<ReturnType<typeof getCourseById>>>> = {};
  for (const id of courseIds) {
    const course = await getCourseById(id);
    if (course) coursesById[id] = course;
  }
  return (
    <StudentReviewsClient
      initialReviews={myReviews}
      publishedCourses={publishedCourses}
      coursesById={coursesById}
      studentId={session!.id}
    />
  );
}
