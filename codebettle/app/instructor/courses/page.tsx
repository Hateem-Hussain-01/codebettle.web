import { getSession } from '@/lib/auth';
import { getCoursesByInstructor } from '@/lib/db/courses';
import { getEnrollmentsByCourse } from '@/lib/db/enrollments';
import Link from 'next/link';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import FadeIn from '@/components/ui/FadeIn';
import { Settings, Users, Star, BookOpen, Video } from 'lucide-react';

export default async function InstructorCoursesPage() {
  const session = await getSession();
  const myCourses = await getCoursesByInstructor(session!.id);

  // Enrollment counts fetched once per course (was a sync call inside .map).
  const enrolledCountByCourse = new Map<string, number>();
  await Promise.all(
    myCourses.map(async (c) => {
      const enrollments = await getEnrollmentsByCourse(c.id);
      enrolledCountByCourse.set(c.id, enrollments.length);
    }),
  );

  const coursesWithStats = myCourses.map(c => ({
    ...c,
    enrolledCount: enrolledCountByCourse.get(c.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-white">My Assigned Courses</h1>
        <p className="text-muted text-sm mt-1">
          {myCourses.length} course{myCourses.length !== 1 ? 's' : ''} assigned to you by admin. You can add class recordings and manage content.
        </p>
      </FadeIn>

      {myCourses.length === 0 ? (
        <Card className="py-16 text-center">
          <BookOpen className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-white font-semibold mb-2">No courses assigned yet</p>
          <p className="text-muted text-sm">The admin will assign courses to you. Contact the admin to get started.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {coursesWithStats.map((course, i) => (
            <FadeIn key={course.id} delay={Math.min(i % 2, 1) * 0.07} className="bg-dark-card border border-dark-border rounded-xl overflow-hidden hover:border-primary/30 transition-all">
              <div className="relative h-40">
                <img src={course.thumbnail} alt={course.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-dark/90 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3">
                  <p className="text-white font-bold text-sm leading-snug">{course.title}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <Badge variant={course.status === 'published' ? 'success' : course.status === 'draft' ? 'warning' : 'muted'}>
                      {course.status}
                    </Badge>
                    <span className="text-xs text-muted capitalize">{course.level}</span>
                  </div>
                </div>
              </div>

              <div className="p-4">
                {/* Zoom link status */}
                <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg mb-3 ${course.zoomLink ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                  <Video className="w-3.5 h-3.5 flex-shrink-0" />
                  {course.zoomLink
                    ? <span>Zoom link active — students can join live classes</span>
                    : <span>No Zoom link — contact admin to add one</span>
                  }
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-muted mb-4">
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{course.enrolledCount} students</span>
                  <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-primary" />{course.rating}</span>
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5" />
                    {course.modules.reduce((a, m) => a + m.lessons.length, 0)} sessions
                  </span>
                </div>

                <Link href={`/instructor/courses/${course.id}`}>
                  <Button fullWidth variant="outline" size="sm">
                    <Settings className="w-3.5 h-3.5" /> Manage Course
                  </Button>
                </Link>
              </div>
            </FadeIn>
          ))}
        </div>
      )}
    </div>
  );
}
