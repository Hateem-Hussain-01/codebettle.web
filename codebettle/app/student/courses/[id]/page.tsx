import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getCourseById } from '@/lib/db/courses';
import { getEnrollmentsByStudent } from '@/lib/db/enrollments';
import { getPendingSubmissionForEnrollment } from '@/lib/db/payments';
import { getCourseAnnouncements } from '@/lib/db/announcements';
import { getUserById } from '@/lib/db/users';
import { Award, XCircle } from 'lucide-react';
import Card from '@/components/ui/Card';
import TeacherAnnouncementsPanel from '@/components/student/TeacherAnnouncementsPanel';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import CourseThumbnail from '@/components/ui/CourseThumbnail';
import Link from 'next/link';
import { toPublicCourse } from '@/lib/db/mappers';
import StudentCourseContent from './student-course-content';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

export default async function StudentCourseViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const course = await getCourseById(id);
  if (!course) notFound();

  const enrollments = await getEnrollmentsByStudent(session!.id);
  const enrollment = enrollments.find(e => e.courseId === id);
  if (!enrollment) notFound();
  // Paid courses enrol as 'pending' until an admin confirms the payment
  // (Phase 7 self-enrolment). Until then the Zoom link, recordings and
  // materials stay locked — the student can see the course exists and
  // read announcements, but cannot join or watch anything.
  const paymentPending = enrollment.paymentStatus === 'pending';
  // Phase 1b: whether a payment submission is already awaiting review
  // decides the banner — "Waiting for Approval" instead of the
  // "Complete Payment" button, so no duplicate submission is possible.
  const pendingSubmission = paymentPending
    ? await getPendingSubmissionForEnrollment(enrollment.id)
    : null;
  // Only the public shape of the course is ever rendered by this page
  // (Phase 0a): no Zoom link, recording URL or materials URL in the
  // HTML. The gated content comes from the authenticated endpoint via
  // StudentCourseContent below. Counts (totalSessions, uploadedCount)
  // are numbers, not links, so they stay server-side.
  const publicCourse = toPublicCourse(course);

  const announcements = await getCourseAnnouncements(id);
  const instructor = await getUserById(course.instructorId);
  // Resolve announcement author names (usually the instructor) so the
  // panel can show who each message is from. Authors that no longer
  // resolve fall back to "Your teacher" inside the panel.
  const authorNames: Record<string, string> = {};
  for (const authorId of [...new Set(announcements.map((a) => a.authorId))]) {
    const author = await getUserById(authorId);
    if (author) authorNames[authorId] = author.name;
  }
  const totalSessions = course.modules.reduce((a, m) => a + m.lessons.length, 0);
  const uploadedCount = course.modules.flatMap(m => m.lessons).filter(l => l.driveRecordingUrl).length;

  const scheduleDays = course.schedule
    ? course.schedule.scheduleType === 'custom'
      ? course.schedule.customDays || []
      : course.schedule.scheduleType === 'weekdays' ? ['Monday','Tuesday','Wednesday','Thursday','Friday']
      : course.schedule.scheduleType === 'weekends' ? ['Saturday','Sunday']
      : DAYS
    : [];

  return (
    <div className="space-y-5">
      {/* Course header */}
      <FadeIn>
        <h1 className="text-2xl font-black text-foreground">{course.title}</h1>
        <div className="flex items-center gap-3 mt-1 text-sm text-muted flex-wrap">
          {instructor && <span>Instructor: <span className="text-primary-text">{instructor.name}</span></span>}
          <span>·</span>
          <span>{totalSessions} classes</span>
          <span>·</span>
          <span>{uploadedCount} recording{uploadedCount !== 1 ? 's' : ''} available</span>
        </div>
      </FadeIn>

      {/* ── Course Completion Banner ── */}
      {course.isCompleted && (
        <div className={`rounded-xl p-5 border ${
          enrollment.certificateEligible === true
            ? 'bg-gradient-to-r from-primary/10 to-transparent border-primary/30'
            : enrollment.certificateEligible === false
            ? 'bg-red-500/5 border-red-500/20'
            : 'bg-dark-card border-dark-border'
        }`}>
          {enrollment.certificateEligible === true && (
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Award className="w-6 h-6 text-primary-text" />
              </div>
              <div className="flex-1">
                <p className="text-foreground font-bold text-lg">🎉 Course Completed!</p>
                <p className="text-muted text-sm mt-1">Congratulations! You are eligible for a certificate. Your certificate is being prepared and will be available soon in your <Link href="/student/certificates" className="text-primary-text hover:underline">Certificates</Link> section.</p>
              </div>
              <Badge variant="primary">Certificate Coming Soon</Badge>
            </div>
          )}
          {enrollment.certificateEligible === false && (
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <XCircle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <p className="text-foreground font-bold">Course Completed</p>
                <p className="text-muted text-sm mt-1">You are <span className="text-red-400 font-medium">not eligible</span> for a certificate for this course. Please contact your instructor or admin for more information.</p>
              </div>
            </div>
          )}
          {enrollment.certificateEligible === undefined && (
            <div className="flex items-center gap-3">
              <Award className="w-5 h-5 text-muted" />
              <p className="text-muted text-sm">Course marked as complete. Certificate eligibility will be updated shortly.</p>
            </div>
          )}
        </div>
      )}

      {/* ── (Instructor class review was removed in Phase 7: the field was
           never populated — no review data exists for it.) ── */}

      {/* Zoom link, recordings and materials come from the gated
          GET /api/student/courses/[id]/content endpoint (Phase 0a) —
          this page only ever renders the public course shape, so no
          recording/materials/Zoom URL reaches the browser for a
          non-enrolled visitor or a pending-payment enrolment. */}
      <StudentCourseContent
        courseId={id}
        modules={publicCourse.modules}
        schedule={publicCourse.schedule}
        scheduleDays={scheduleDays}
        isCompleted={course.isCompleted}
        paymentPending={paymentPending}
        enrollmentId={enrollment.id}
        coursePrice={course.price}
        hasPendingSubmission={pendingSubmission !== null}
      >
        {/* Sidebar */}
        <FadeIn delay={0.1} className="space-y-4">
          <Card>
            <CourseThumbnail src={course.thumbnail} alt={course.title} className="w-full h-28 object-cover rounded-lg mb-3" />
            <div className="space-y-1.5 text-xs text-muted">
              <p>Category: <span className="text-foreground">{course.category}</span></p>
              <p>Level: <span className="text-foreground capitalize">{course.level}</span></p>
              <p>Total Classes: <span className="text-foreground">{totalSessions}</span></p>
              <p>Recordings: {paymentPending ? <span className="text-yellow-400 font-medium">Locked until payment is confirmed</span> : <span className="text-green-400 font-medium">{uploadedCount} available</span>}</p>
              <p>Status: <span className={course.isCompleted ? 'text-green-400 font-medium' : 'text-primary-text font-medium'}>{course.isCompleted ? 'Completed' : 'Active'}</span></p>
            </div>
          </Card>
          {instructor && (
            <Card>
              <h3 className="font-semibold text-foreground text-sm mb-3">Your Instructor</h3>
              <div className="flex items-center gap-3">
                <img src={instructor.avatar || ''} alt={instructor.name} className="w-10 h-10 rounded-full border border-primary/30" />
                <div>
                  <p className="text-foreground font-medium text-sm">{instructor.name}</p>
                  <p className="text-muted text-xs">{instructor.expertise?.slice(0, 2).join(' · ')}</p>
                </div>
              </div>
            </Card>
          )}
          {/* Phase 3: teacher announcements — title, content, author, date. */}
          <TeacherAnnouncementsPanel announcements={announcements} authorNames={authorNames} />
        </FadeIn>
      </StudentCourseContent>
    </div>
  );
}
