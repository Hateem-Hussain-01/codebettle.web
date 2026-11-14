import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { getCourseById } from '@/lib/db/courses';
import {
  areReviewModerationColumnsReady,
  getReviewsByStatus,
  listReviews,
} from '@/lib/db/reviews';
import type { ReviewStatus } from '@/lib/db/types';
import { getUserById } from '@/lib/db/users';

/**
 * GET /api/admin/course-reviews — moderation queue (Course Reviews admin
 * section). Query `status` = all | pending | approved | rejected
 * (default: all). Guard: requireAdminArea('course-reviews').
 * Includes `columnsReady` so the admin UI can show a "run the SQL" state
 * when the moderation migration has not run yet, plus the student names
 * and course titles the list displays.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminArea('course-reviews');
  if ('error' in auth) return auth.error;
  const status = request.nextUrl.searchParams.get('status') ?? 'all';
  const columnsReady = await areReviewModerationColumnsReady();
  const reviews =
    status === 'pending' || status === 'approved' || status === 'rejected'
      ? await getReviewsByStatus(status as ReviewStatus)
      : await listReviews();
  const studentIds = [...new Set(reviews.map((r) => r.studentId))];
  const courseIds = [...new Set(reviews.map((r) => r.courseId))];
  const [students, courses] = await Promise.all([
    Promise.all(studentIds.map((id) => getUserById(id))),
    Promise.all(courseIds.map((id) => getCourseById(id))),
  ]);
  const studentNames: Record<string, string> = {};
  students.forEach((u, i) => {
    if (u) studentNames[studentIds[i]] = u.name;
  });
  const courseTitles: Record<string, string> = {};
  courses.forEach((c, i) => {
    if (c) courseTitles[courseIds[i]] = c.title;
  });
  return NextResponse.json({ reviews, columnsReady, studentNames, courseTitles });
}
