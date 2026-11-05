import { getSession } from '@/lib/auth';
import { getCoursesByInstructor } from '@/lib/data/courses';
import { enrollments } from '@/lib/data/enrollments';
import { reviews } from '@/lib/data/reviews';
import { getUserById } from '@/lib/data/users';
import StatCard from '@/components/ui/StatCard';
import Card from '@/components/ui/Card';
import StarRating from '@/components/ui/StarRating';
import { Users, BookOpen, Star, TrendingUp } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';

export default async function InstructorDashboard() {
  const session = await getSession();
  const myCourses = getCoursesByInstructor(session!.id);
  const courseIds = myCourses.map(c => c.id);
  const myEnrollments = enrollments.filter(e => courseIds.includes(e.courseId));
  const myReviews = reviews.filter(r => courseIds.includes(r.courseId));
  const avgRating = myReviews.length ? (myReviews.reduce((a, r) => a + r.rating, 0) / myReviews.length).toFixed(1) : '0.0';
  const published = myCourses.filter(c => c.status === 'published').length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white">Welcome back, {session!.name.split(' ')[0]}!</h1>
        <p className="text-muted text-sm mt-1">Here's your teaching overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Students" value={myEnrollments.length} icon={<Users className="w-6 h-6" />} color="blue" />
        <StatCard title="Active Courses" value={published} icon={<BookOpen className="w-6 h-6" />} color="yellow" />
        <StatCard title="Avg. Rating" value={avgRating} icon={<Star className="w-6 h-6" />} color="yellow" />
        <StatCard title="Total Reviews" value={myReviews.length} icon={<TrendingUp className="w-6 h-6" />} color="green" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Enrollments */}
        <Card>
          <h2 className="text-white font-bold mb-4">Recent Enrollments</h2>
          {myEnrollments.length === 0 ? (
            <p className="text-muted text-sm text-center py-8">No enrollments yet</p>
          ) : (
            <div className="space-y-3">
              {myEnrollments.slice(0, 6).map(enr => {
                const student = getUserById(enr.studentId);
                const course = myCourses.find(c => c.id === enr.courseId);
                return (
                  <div key={enr.id} className="flex items-center gap-3 py-2 border-b border-dark-border last:border-0">
                    <img src={student?.avatar || ''} alt={student?.name} className="w-8 h-8 rounded-full border border-primary/20" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{student?.name}</p>
                      <p className="text-muted text-xs truncate">{course?.title}</p>
                    </div>
                    <p className="text-muted text-xs flex-shrink-0">{formatDateShort(enr.enrolledAt)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Recent Reviews */}
        <Card>
          <h2 className="text-white font-bold mb-4">Recent Reviews</h2>
          {myReviews.length === 0 ? (
            <p className="text-muted text-sm text-center py-8">No reviews yet</p>
          ) : (
            <div className="space-y-4">
              {myReviews.slice(0, 4).map(review => {
                const course = myCourses.find(c => c.id === review.courseId);
                return (
                  <div key={review.id} className="py-2 border-b border-dark-border last:border-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-white text-xs font-medium">{course?.title}</p>
                      <StarRating rating={review.rating} size="sm" />
                    </div>
                    <p className="text-muted text-xs line-clamp-2">{review.comment}</p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
