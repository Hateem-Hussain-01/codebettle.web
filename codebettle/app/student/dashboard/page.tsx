import { getSession } from '@/lib/auth';
import { getBatchById } from '@/lib/db/batches';
import { getEnrollmentsByStudent } from '@/lib/db/enrollments';
import { getCoursesByIds } from '@/lib/db/courses';
import { getCertificatesByStudent } from '@/lib/db/certificates';
import { getSiteWideAnnouncements } from '@/lib/db/announcements';
import { summarizeCourseProgress } from '@/lib/services/progress-service';
import { formatDateShort } from '@/lib/utils';
import Link from 'next/link';
import { BookOpen, Award, Bell, ArrowRight, CheckCircle } from 'lucide-react';
import Card from '@/components/ui/Card';
import StatCard from '@/components/ui/StatCard';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import CourseThumbnail from '@/components/ui/CourseThumbnail';
import ProgressBar from '@/components/ui/ProgressBar';

export default async function StudentDashboard() {
  const session = await getSession();
  const enrollments = await getEnrollmentsByStudent(session!.id);
  const certificates = await getCertificatesByStudent(session!.id);
  const announcements = await getSiteWideAnnouncements();

  // Courses fetched in ONE query (Phase 7 perf — was one getCourseById
  // per enrolment).
  const coursesById = new Map((await getCoursesByIds(enrollments.map((e) => e.courseId))).map((c) => [c.id, c]));
  const enrolledCourses = enrollments
    .map((e) => ({ enrollment: e, course: coursesById.get(e.courseId) }))
    .filter((item): item is { enrollment: (typeof enrollments)[number]; course: NonNullable<ReturnType<typeof coursesById.get>> } => item.course !== undefined);

  // The batch each enrolment is in (name + start date), fetched once per
  // distinct batch. Enrolments made before batches existed have none.
  const batchById = new Map<string, Awaited<ReturnType<typeof getBatchById>>>();
  await Promise.all(
    [...new Set(enrollments.map((e) => e.batchId).filter((b): b is string => Boolean(b)))].map(async (batchId) => {
      batchById.set(batchId, await getBatchById(batchId));
    }),
  );

  const completed = enrollments.filter(e => e.isCompleted).length;

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <FadeIn className="bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 rounded-xl p-6">
        <h1 className="text-2xl font-black text-foreground mb-1">Welcome back, {session!.name.split(' ')[0]}! 👋</h1>
        <p className="text-muted">Ready to continue your learning journey?</p>
      </FadeIn>

      {/* Stats — the canonical StatCard (V32): muted label, big
          count-up value, tinted icon square. Same real values as
          before (enrolment / completion / certificate counts); the
          stagger comes from StatCard's own entrance delay, so no
          FadeIn wrapper is needed around each card (that would fade
          the card twice). */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Enrolled Courses', value: enrollments.length, icon: <BookOpen className="w-5 h-5" />, color: 'blue' as const, href: '/student/courses' },
          { label: 'Completed', value: completed, icon: <CheckCircle className="w-5 h-5" />, color: 'green' as const, href: '/student/courses' },
          { label: 'Certificates', value: certificates.length, icon: <Award className="w-5 h-5" />, color: 'yellow' as const, href: '/student/certificates' },
        ].map((stat, i) => (
          <StatCard key={stat.label} title={stat.label} value={stat.value} icon={stat.icon} color={stat.color} delay={0.05 + i * 0.06} glass href={stat.href} />
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* My Courses — heading fades in, then each course row fills
            in one by one (V32 staggered entrance). The outer FadeIn
            is gone: it used to fade the whole section AND the rows
            would have faded a second time. */}
        <div className="lg:col-span-2">
          <FadeIn delay={0.1}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">My Courses</h2>
              <Link href="/student/courses" className="text-primary-text text-sm hover:underline flex items-center gap-1">View All <ArrowRight className="w-3.5 h-3.5" /></Link>
            </div>
          </FadeIn>
          {enrolledCourses.length === 0 ? (
            <FadeIn delay={0.14}>
              <Card glass>
                <p className="text-muted text-sm text-center py-8">No courses enrolled yet. <Link href="/courses" className="text-primary-text hover:underline">Browse courses</Link></p>
              </Card>
            </FadeIn>
          ) : (
            <div className="space-y-3">
              {enrolledCourses.slice(0, 4).map(({ enrollment, course }, i) => {
                const batch = enrollment.batchId ? batchById.get(enrollment.batchId) : null;
                // Student Progress Tracking: % complete + next lesson for
                // this enrolment (completed lessons come from the
                // LessonProgress table via the enrolment).
                const progress = summarizeCourseProgress(course!.modules, enrollment.completedLessons);
                return (
                <FadeIn key={enrollment.id} delay={0.14 + i * 0.05}>
                <Link href={`/student/courses/${enrollment.courseId}`}>
                  <Card hover glow glass className="p-4">
                    <div className="flex items-center gap-4">
                      <CourseThumbnail src={course!.thumbnail} alt={course!.title} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground font-semibold text-sm truncate">{course!.title}</p>
                        <p className="text-muted text-xs">{enrollment.completedLessons.length} lessons accessed</p>
                        {batch && <p className="text-muted text-xs">Batch {batch.batchNumber}{batch.startDate ? ` — starts ${formatDateShort(batch.startDate)}` : ''}</p>}
                        {/* Progress — bar + % + next lesson (or complete). The whole card links to the course page, so tapping here continues the course. */}
                        <div className="mt-2">
                          <ProgressBar
                            percent={progress.percent}
                            label={progress.totalLessons === 0
                              ? 'No lessons yet'
                              : `${progress.percent}% complete · ${progress.completedCount} of ${progress.totalLessons} lessons`}
                          />
                          {progress.isComplete ? (
                            <p className="text-green-400 text-xs mt-1">Course complete 🎉</p>
                          ) : progress.nextLesson ? (
                            <p className="text-primary-text text-xs mt-1">Continue: {progress.nextLesson.lessonTitle}</p>
                          ) : null}
                        </div>
                      </div>
                      {enrollment.isCompleted
                        ? <Badge variant="success">Completed</Badge>
                        : <Badge variant="info">In Progress</Badge>
                      }
                    </div>
                  </Card>
                </Link>
                </FadeIn>
                );
              })}
            </div>
          )}
        </div>

        {/* Announcements — same staggered pattern as My Courses. */}
        <div>
          <FadeIn delay={0.15}>
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-4 h-4 text-primary-text" />
              <h2 className="text-lg font-bold text-foreground">Announcements</h2>
            </div>
          </FadeIn>
          <div className="space-y-3">
            {announcements.slice(0, 4).map((ann, i) => (
              <FadeIn key={ann.id} delay={0.19 + i * 0.05}>
                <Card glass className="p-4">
                  <p className="text-foreground text-sm font-medium mb-1">{ann.title}</p>
                  <p className="text-muted text-xs line-clamp-2 mb-2">{ann.content}</p>
                  <p className="text-muted text-xs">{formatDateShort(ann.createdAt)}</p>
                </Card>
              </FadeIn>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
