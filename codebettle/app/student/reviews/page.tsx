import { getSession } from '@/lib/auth';
import { getReviewsByStudent } from '@/lib/db/reviews';
import { getCoursesByIds } from '@/lib/db/courses';
import { getEnrollmentsByStudent } from '@/lib/db/enrollments';
import { toPublicCourse } from '@/lib/db/mappers';
import StudentReviewsClient from './student-reviews-client';

/**
 * Student reviews — server wrapper (Phase 2, wired to the real review
 * API in Phase 7).
 * Fetches the logged-in student's reviews, the courses they are
 * enrolled in (the write-a-review dropdown offers ONLY those — you
 * cannot review a course you never took) and the reviewed courses,
 * and passes them to the client component.
 */
export default async function StudentReviewsPage() {
  const session = await getSession();
  const myReviews = await getReviewsByStudent(session!.id);
  const enrollments = await getEnrollmentsByStudent(session!.id);
  // Enrolled + reviewed courses in ONE query (Phase 7 perf — was two
  // sequential getCourseById loops).
  const allCourseIds = [...new Set([...enrollments.map((e) => e.courseId), ...myReviews.map((r) => r.courseId)])];
  const coursesById: Record<string, ReturnType<typeof toPublicCourse>> = {};
  for (const course of await getCoursesByIds(allCourseIds)) coursesById[course.id] = toPublicCourse(course);
  const enrolledCourses = enrollments
    .map((e) => coursesById[e.courseId])
    .filter((c): c is NonNullable<typeof c> => c !== undefined);
  return (
    <StudentReviewsClient
      initialReviews={myReviews}
      enrolledCourses={enrolledCourses}
      coursesById={coursesById}
      studentId={session!.id}
    />
  );
}
