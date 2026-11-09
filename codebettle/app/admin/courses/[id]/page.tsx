import { notFound } from 'next/navigation';
import { getCourseById } from '@/lib/db/courses';
import { getEnrollmentsByCourse } from '@/lib/db/enrollments';
import { getUserById } from '@/lib/db/users';
import type { SafeUser } from '@/lib/db/types';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import StarRating from '@/components/ui/StarRating';
import { Award, XCircle, Lock, Users, Calendar, Clock, BookOpen, Video } from 'lucide-react';
import { formatDate, formatDateShort, formatPrice } from '@/lib/utils';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import CourseCurriculumClient from './course-curriculum-client';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

export default async function AdminCourseDetailPage({ params }: PageProps<'/admin/courses/[id]'>) {
  const { id } = await params;
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/auth/login');

  const course = await getCourseById(id);
  if (!course) notFound();

  const enrollments = await getEnrollmentsByCourse(id);
  const instructor = await getUserById(course.instructorId);

  // Student map built once (was a getUserById call inside JSX per row).
  const studentMap = new Map<string, SafeUser>();
  await Promise.all(
    [...new Set(enrollments.map(e => e.studentId))].map(async (studentId) => {
      const student = await getUserById(studentId);
      if (student) studentMap.set(studentId, student);
    }),
  );

  const scheduleDays = course.schedule
    ? course.schedule.scheduleType === 'custom' ? (course.schedule.customDays || [])
      : course.schedule.scheduleType === 'weekdays' ? ['Monday','Tuesday','Wednesday','Thursday','Friday']
      : course.schedule.scheduleType === 'weekends' ? ['Saturday','Sunday']
      : DAYS
    : [];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <Link href="/admin/courses"><Button variant="ghost" size="sm">← Back</Button></Link>
          <div>
            <h1 className="text-xl font-black text-white">{course.title}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant={course.status === 'published' ? 'success' : course.status === 'draft' ? 'warning' : 'muted'}>{course.status}</Badge>
              {course.isCompleted && <Badge variant="info">Completed</Badge>}
              <span className="text-muted text-xs">{formatPrice(course.price)}</span>
              <span className="text-muted text-xs">{enrollments.length} enrolled</span>
            </div>
          </div>
        </div>
      </div>

      {/* Instructor info */}
      {instructor && (
        <Card>
          <h2 className="text-white font-bold mb-3 text-sm">Assigned Instructor</h2>
          <div className="flex items-center gap-3">
            <img src={instructor.avatar || ''} alt={instructor.name} className="w-12 h-12 rounded-full border-2 border-primary/30" />
            <div>
              <p className="text-white font-semibold">{instructor.name}</p>
              <p className="text-muted text-xs">{instructor.email}</p>
              <p className="text-muted text-xs mt-0.5">{instructor.expertise?.join(' · ')}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {/* Curriculum status */}
              {course.modules.length > 0
                ? <Badge variant="success">Curriculum Added</Badge>
                : <Badge variant="warning">No Curriculum Yet</Badge>
              }
            </div>
          </div>
          {course.zoomLink && (
            <div className="mt-3 flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
              <Video className="w-3.5 h-3.5" />Zoom: {course.zoomLink}
            </div>
          )}
        </Card>
      )}

      {/* ── PRIVATE Instructor Review (admin only) ── */}
      {course.instructorPrivateReview && (
        <Card className="border-yellow-500/20">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-4 h-4 text-yellow-400" />
            <h2 className="text-white font-bold text-sm">Instructor's Private Review</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 ml-auto">Admin Only</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <StarRating rating={course.instructorPrivateReview.rating} size="sm" />
            <span className="text-muted text-xs">{course.instructorPrivateReview.rating}/5</span>
            <span className="text-muted text-xs ml-auto">{formatDateShort(course.instructorPrivateReview.submittedAt)}</span>
          </div>
          <p className="text-muted text-sm leading-relaxed italic">"{course.instructorPrivateReview.comment}"</p>
        </Card>
      )}

      {/* ── PUBLIC Instructor Review ── */}
      {course.instructorClassReview && (
        <Card className="border-primary/20">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-white font-bold text-sm">Instructor's Class Review</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 ml-auto">Visible to students</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <StarRating rating={course.instructorClassReview.rating} size="sm" />
            <span className="text-muted text-xs">{course.instructorClassReview.rating}/5</span>
            <span className="text-muted text-xs ml-auto">{formatDateShort(course.instructorClassReview.submittedAt)}</span>
          </div>
          <p className="text-muted text-sm leading-relaxed italic">"{course.instructorClassReview.comment}"</p>
        </Card>
      )}

      {/* Schedule */}
      {course.schedule && (
        <Card>
          <h2 className="text-white font-bold mb-4 text-sm flex items-center gap-2"><Calendar className="w-4 h-4 text-green-400" />Class Schedule</h2>
          <div className="grid sm:grid-cols-3 gap-3 text-xs mb-3">
            <div className="bg-dark-border/30 rounded-lg p-3">
              <p className="text-muted mb-1">Time</p>
              <p className="text-white font-medium">{course.schedule.classTime}</p>
            </div>
            <div className="bg-dark-border/30 rounded-lg p-3">
              <p className="text-muted mb-1">Duration</p>
              <p className="text-white font-medium">{course.schedule.classDuration}</p>
            </div>
            <div className="bg-dark-border/30 rounded-lg p-3">
              <p className="text-muted mb-1">Start Date</p>
              <p className="text-white font-medium">{course.schedule.startDate ? formatDateShort(course.schedule.startDate) : '—'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {scheduleDays.map(d => <span key={d} className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{d}</span>)}
          </div>
          {course.schedule.notes && <p className="text-muted text-xs mt-2 italic">{course.schedule.notes}</p>}
        </Card>
      )}

      {/* Students & Certificate Eligibility */}
      <Card>
        <h2 className="text-white font-bold mb-4 text-sm flex items-center gap-2"><Users className="w-4 h-4 text-primary" />Enrolled Students & Certificate Status</h2>
        {enrollments.length === 0 ? (
          <p className="text-muted text-sm text-center py-6">No students enrolled</p>
        ) : (
          <div className="space-y-2">
            {enrollments.map(enr => {
              const student = studentMap.get(enr.studentId);
              return (
                <div key={enr.id} className="flex items-center gap-3 py-2 border-b border-dark-border/40 last:border-0">
                  <img src={student?.avatar || ''} alt={student?.name} className="w-8 h-8 rounded-full" />
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">{student?.name}</p>
                    <p className="text-muted text-xs">{student?.email}</p>
                  </div>
                  {course.isCompleted ? (
                    enr.certificateEligible === true
                      ? <div className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-2.5 py-1"><Award className="w-3.5 h-3.5" />Eligible</div>
                      : <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1"><XCircle className="w-3.5 h-3.5" />Not Eligible</div>
                  ) : (
                    <Badge variant="info">Active</Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {course.isCompleted && (
          <div className="mt-3 pt-3 border-t border-dark-border flex gap-4 text-xs text-muted">
            <span className="text-green-400">{enrollments.filter(e => e.certificateEligible === true).length} eligible</span>
            <span className="text-red-400">{enrollments.filter(e => e.certificateEligible === false).length} not eligible</span>
          </div>
        )}
      </Card>

      {/* Curriculum overview */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-sm flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary" />Curriculum</h2>
          {course.modules.length > 0
            ? <Badge variant="success">{course.modules.reduce((a, m) => a + m.lessons.length, 0)} classes across {course.modules.length} modules</Badge>
            : <Badge variant="warning">Empty — waiting for instructor</Badge>
          }
        </div>
        {course.modules.length === 0 ? (
          <p className="text-muted text-sm text-center py-6">Instructor hasn't added curriculum yet</p>
        ) : (
          <div className="space-y-2">
            {course.modules.map(mod => (
              <div key={mod.id} className="bg-dark-border/20 rounded-lg px-4 py-3">
                <p className="text-white text-sm font-medium">{mod.title}</p>
                <p className="text-muted text-xs">{mod.lessons.length} class session{mod.lessons.length !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Curriculum management (Phase 3 — wired to the module/lesson write APIs) */}
      <CourseCurriculumClient courseId={course.id} modules={course.modules} />
    </div>
  );
}
