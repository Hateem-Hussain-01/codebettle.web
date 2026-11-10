import { getSession } from '@/lib/auth';
import { getEnrollmentsByStudent } from '@/lib/db/enrollments';
import { getCoursesByIds } from '@/lib/db/courses';
import { getCertificatesByStudentAndCourses } from '@/lib/db/certificates';
import { formatDateShort } from '@/lib/utils';
import Link from 'next/link';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';
import { BookOpen, Award, PlayCircle } from 'lucide-react';

export default async function StudentCoursesPage() {
  const session = await getSession();
  const enrollments = await getEnrollmentsByStudent(session!.id);

  // Courses + certificates fetched in TWO queries total (Phase 7 perf —
  // was one getCourseById + one certificate lookup per enrolment).
  const courseIds = enrollments.map((e) => e.courseId);
  const coursesById = new Map((await getCoursesByIds(courseIds)).map((c) => [c.id, c]));
  const certsByCourse = new Map(
    (await getCertificatesByStudentAndCourses(session!.id, courseIds)).map((c) => [c.courseId, c]),
  );
  const items = enrollments
    .map((e) => ({ enrollment: e, course: coursesById.get(e.courseId), certificate: certsByCourse.get(e.courseId) ?? null }))
    .filter((i): i is typeof i & { course: NonNullable<typeof i.course> } => i.course !== undefined);

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-white">My Courses</h1>
        <p className="text-muted text-sm mt-1">{items.length} enrolled course{items.length !== 1 ? 's' : ''}</p>
      </FadeIn>

      {items.length === 0 ? (
        <Card className="py-16 text-center">
          <BookOpen className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-white font-semibold mb-2">No courses yet</p>
          <p className="text-muted text-sm mb-4">Start your learning journey by enrolling in a course.</p>
          <Link href="/courses" className="text-primary hover:underline text-sm">Browse Courses →</Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map(({ enrollment, course, certificate }, i) => (
            <FadeIn key={enrollment.id} delay={Math.min(i % 3, 2) * 0.07} className="bg-dark-card border border-dark-border rounded-xl overflow-hidden hover:border-primary/30 transition-all group">
              <div className="relative h-40">
                <img src={course!.thumbnail} alt={course!.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-dark/80 to-transparent" />
                {enrollment.isCompleted && (
                  <div className="absolute top-3 right-3">
                    <span className="text-xs font-bold px-2.5 py-1 bg-green-500 text-white rounded-full flex items-center gap-1">
                      <Award className="w-3 h-3" /> Completed
                    </span>
                  </div>
                )}
              </div>
              <div className="p-4">
                <h3 className="text-white font-semibold text-sm mb-1 line-clamp-2">{course!.title}</h3>
                <p className="text-muted text-xs mb-3">Enrolled {formatDateShort(enrollment.enrolledAt)}</p>
                <p className="text-xs text-muted mb-4">{enrollment.completedLessons.length} lesson{enrollment.completedLessons.length !== 1 ? 's' : ''} accessed</p>
                <div className="flex items-center gap-2">
                  <Link href={`/student/courses/${enrollment.courseId}`} className="flex-1">
                    <button className="w-full flex items-center justify-center gap-2 py-2 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary hover:text-dark transition-all cursor-pointer">
                      <PlayCircle className="w-3.5 h-3.5" /> Continue
                    </button>
                  </Link>
                  {certificate && (
                    <Link href="/student/certificates">
                      <button className="py-2 px-3 bg-green-500/10 text-green-400 rounded-lg text-xs font-medium hover:bg-green-500/20 transition-all cursor-pointer">
                        <Award className="w-3.5 h-3.5" />
                      </button>
                    </Link>
                  )}
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      )}
    </div>
  );
}
