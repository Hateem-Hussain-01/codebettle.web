import { getSession } from '@/lib/auth';
import { getCoursesByInstructor } from '@/lib/db/courses';
import { getReviewsByCourseIds } from '@/lib/db/reviews';
import { getUserById } from '@/lib/db/users';
import type { SafeUser } from '@/lib/db/types';
import StarRating from '@/components/ui/StarRating';
import Card from '@/components/ui/Card';
import { Star } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';

export default async function InstructorReviewsPage() {
  const session = await getSession();
  const myCourses = await getCoursesByInstructor(session!.id);

  // Reviews for all my courses in ONE query (Phase 7 perf — was one
  // query per course).
  const allCourseReviews = await getReviewsByCourseIds(myCourses.map((c) => c.id));
  const reviewsByCourse = myCourses.map((course) => ({
    course,
    reviews: allCourseReviews.filter((r) => r.courseId === course.id),
  }));
  const allReviews = reviewsByCourse.flatMap(({ course, reviews }) =>
    reviews.map(r => ({ ...r, course }))
  );

  const avgRating = allReviews.length ? (allReviews.reduce((a, r) => a + r.rating, 0) / allReviews.length).toFixed(1) : '0.0';

  // Student map built once (was a getUserById call inside JSX per row).
  const studentMap = new Map<string, SafeUser>();
  await Promise.all(
    [...new Set(allReviews.map(r => r.studentId))].map(async (studentId) => {
      const student = await getUserById(studentId);
      if (student) studentMap.set(studentId, student);
    }),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Reviews</h1>
          <p className="text-muted text-sm mt-1">{allReviews.length} review{allReviews.length !== 1 ? 's' : ''} • Avg: {avgRating} ⭐</p>
        </div>
      </div>

      {allReviews.length === 0 ? (
        <Card className="py-16 text-center">
          <Star className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-white font-semibold">No reviews yet</p>
          <p className="text-muted text-sm mt-1">Reviews will appear here once students rate your courses.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {allReviews.map(review => {
            const student = studentMap.get(review.studentId);
            return (
              <Card key={review.id} hover>
                <div className="flex items-start gap-4">
                  <img src={student?.avatar || ''} alt={student?.name} className="w-10 h-10 rounded-full border border-primary/20 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-white font-medium text-sm">{student?.name || 'Student'}</p>
                        <p className="text-primary text-xs">{review.course.title}</p>
                      </div>
                      <div className="flex-shrink-0">
                        <StarRating rating={review.rating} size="sm" />
                        <p className="text-muted text-xs text-right mt-0.5">{formatDateShort(review.createdAt)}</p>
                      </div>
                    </div>
                    <p className="text-muted text-sm mt-2">{review.comment}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
