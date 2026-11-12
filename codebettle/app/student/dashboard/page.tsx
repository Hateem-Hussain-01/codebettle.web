import { getSession } from '@/lib/auth';
import { getEnrollmentsByStudent } from '@/lib/db/enrollments';
import { getCoursesByIds } from '@/lib/db/courses';
import { getCertificatesByStudent } from '@/lib/db/certificates';
import { getSiteWideAnnouncements } from '@/lib/db/announcements';
import { formatDateShort } from '@/lib/utils';
import Link from 'next/link';
import { BookOpen, Award, Bell, ArrowRight, CheckCircle } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import CourseThumbnail from '@/components/ui/CourseThumbnail';

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

  const completed = enrollments.filter(e => e.isCompleted).length;

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <FadeIn className="bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 rounded-xl p-6">
        <h1 className="text-2xl font-black text-foreground mb-1">Welcome back, {session!.name.split(' ')[0]}! 👋</h1>
        <p className="text-muted">Ready to continue your learning journey?</p>
      </FadeIn>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Enrolled Courses', value: enrollments.length, icon: <BookOpen className="w-5 h-5" />, color: 'text-blue-400 bg-blue-400/10' },
          { label: 'Completed', value: completed, icon: <CheckCircle className="w-5 h-5" />, color: 'text-green-400 bg-green-400/10' },
          { label: 'Certificates', value: certificates.length, icon: <Award className="w-5 h-5" />, color: 'text-primary-text bg-primary/10' },
        ].map((stat, i) => (
          <FadeIn key={stat.label} delay={0.05 + i * 0.06}>
          <Card hover>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.color}`}>{stat.icon}</div>
              <div>
                <p className="text-2xl font-black text-foreground">{stat.value}</p>
                <p className="text-muted text-sm">{stat.label}</p>
              </div>
            </div>
          </Card>
          </FadeIn>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* My Courses */}
        <FadeIn delay={0.1} className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground">My Courses</h2>
            <Link href="/student/courses" className="text-primary-text text-sm hover:underline flex items-center gap-1">View All <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
          {enrolledCourses.length === 0 ? (
            <Card>
              <p className="text-muted text-sm text-center py-8">No courses enrolled yet. <Link href="/courses" className="text-primary-text hover:underline">Browse courses</Link></p>
            </Card>
          ) : (
            <div className="space-y-3">
              {enrolledCourses.slice(0, 4).map(({ enrollment, course }) => (
                <Link key={enrollment.id} href={`/student/courses/${enrollment.courseId}`}>
                  <Card hover glow className="p-4">
                    <div className="flex items-center gap-4">
                      <CourseThumbnail src={course!.thumbnail} alt={course!.title} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground font-semibold text-sm truncate">{course!.title}</p>
                        <p className="text-muted text-xs">{enrollment.completedLessons.length} lessons accessed</p>
                      </div>
                      {enrollment.isCompleted
                        ? <Badge variant="success">Completed</Badge>
                        : <Badge variant="info">In Progress</Badge>
                      }
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </FadeIn>

        {/* Announcements */}
        <FadeIn delay={0.15}>
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-4 h-4 text-primary-text" />
            <h2 className="text-lg font-bold text-foreground">Announcements</h2>
          </div>
          <div className="space-y-3">
            {announcements.slice(0, 4).map(ann => (
              <Card key={ann.id} className="p-4">
                <p className="text-foreground text-sm font-medium mb-1">{ann.title}</p>
                <p className="text-muted text-xs line-clamp-2 mb-2">{ann.content}</p>
                <p className="text-muted text-xs">{formatDateShort(ann.createdAt)}</p>
              </Card>
            ))}
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
