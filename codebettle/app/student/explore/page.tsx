import { getSession } from '@/lib/auth';
import { getPublishedCourses } from '@/lib/db/courses';
import { getEnrollmentsByStudent } from '@/lib/db/enrollments';
import { formatPrice, getTotalLessonsCount } from '@/lib/utils';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';
import CourseThumbnail from '@/components/ui/CourseThumbnail';
import ExploreEnrollButton from './explore-enroll-button';
import { Compass, BookOpen, PlayCircle, Star } from 'lucide-react';

/**
 * Explore New Courses (Eman, 15 Nov 2026) — the student portal's own
 * course catalogue. Students who finished their courses had no way to
 * join another one without leaving for the landing page; this page
 * lists EVERY published course, right inside the portal.
 *
 * Enrolment reuses the one existing path (POST /api/student/enrollments
 * via ExploreEnrollButton) — the server picks the open batch and sets
 * paymentStatus itself. A course the student already has is shown with
 * its enrolled state (Continue) instead of an Enrol button.
 */
export default async function StudentExplorePage() {
  const session = await getSession();
  const courses = await getPublishedCourses();
  const enrollments = await getEnrollmentsByStudent(session!.id);
  const enrolledByCourse = new Map(enrollments.map((e) => [e.courseId, e]));

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-foreground">Explore New Courses</h1>
        <p className="text-muted text-sm mt-1">
          {courses.length} course{courses.length !== 1 ? 's' : ''} available — enrol from here, no need to leave the portal
        </p>
      </FadeIn>

      {courses.length === 0 ? (
        <Card className="py-16 text-center">
          <Compass className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-foreground font-semibold mb-2">No courses available yet</p>
          <p className="text-muted text-sm">Check back soon — new courses are added regularly.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {courses.map((course, i) => {
            const enrollment = enrolledByCourse.get(course.id);
            const totalLessons = getTotalLessonsCount(course.modules);
            return (
              <FadeIn key={course.id} delay={Math.min(i % 3, 2) * 0.07} className="bg-dark-card border border-dark-border rounded-xl overflow-hidden hover:border-primary/30 transition-all group">
                <div className="relative h-40">
                  <CourseThumbnail src={course.thumbnail} alt={course.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  {/* Module 6: photo overlay stays dark in both themes. */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  {enrollment && (
                    <div className="absolute top-3 right-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${enrollment.paymentStatus === 'pending' ? 'bg-amber-500 text-white' : 'bg-green-500 text-white'}`}>
                        {enrollment.paymentStatus === 'pending' ? 'Payment pending' : 'Enrolled'}
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-foreground font-semibold text-sm mb-1 line-clamp-2">{course.title}</h3>
                  <p className="text-muted text-xs mb-3">
                    {course.category} · {course.level.charAt(0).toUpperCase() + course.level.slice(1)} · {totalLessons} lesson{totalLessons !== 1 ? 's' : ''}
                  </p>
                  <div className="flex items-center gap-3 mb-4">
                    <span className={`text-lg font-black ${course.isFree ? 'text-green-400' : 'text-primary-text'}`}>{formatPrice(course.price)}</span>
                    {course.reviewCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted">
                        <Star className="w-3.5 h-3.5 fill-primary-text text-primary-text" />
                        {course.rating} ({course.reviewCount})
                      </span>
                    )}
                    <span className="text-xs text-muted ml-auto">{course.enrolledCount.toLocaleString()} students</span>
                  </div>
                  {enrollment ? (
                    <Link href={`/student/courses/${course.id}`}>
                      <button className="w-full flex items-center justify-center gap-2 py-2 bg-primary/10 text-primary-text rounded-lg text-xs font-medium hover:bg-primary hover:text-ink transition-all cursor-pointer">
                        <PlayCircle className="w-3.5 h-3.5" /> Continue Learning
                      </button>
                    </Link>
                  ) : (
                    <ExploreEnrollButton courseId={course.id} isFree={course.isFree} />
                  )}
                  <Link href={`/courses/${course.slug}`} className="block text-center text-xs text-muted hover:text-primary-text mt-3">
                    View details →
                  </Link>
                </div>
              </FadeIn>
            );
          })}
        </div>
      )}
    </div>
  );
}
