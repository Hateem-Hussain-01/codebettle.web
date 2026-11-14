import { connection } from 'next/server';
import CourseReviewsClient from './course-reviews-client';

/**
 * Admin > Course Reviews — student-submitted per-course reviews, moderated
 * here (consistent with Success Stories). Server wrapper only: the list
 * loads client-side from GET /api/admin/course-reviews. The admin layout
 * enforces the 'course-reviews' area server-side.
 */
export default async function AdminCourseReviewsPage() {
  await connection();
  return <CourseReviewsClient />;
}
