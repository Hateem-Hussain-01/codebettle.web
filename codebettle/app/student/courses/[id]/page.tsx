import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getCourseById } from '@/lib/db/courses';
import { getEnrollmentsByStudent } from '@/lib/db/enrollments';
import { getCourseAnnouncements } from '@/lib/db/announcements';
import { getUserById } from '@/lib/db/users';
import { formatDateShort } from '@/lib/utils';
import { ExternalLink, Download, Bell, BookOpen, Video, Lock, Award, XCircle, Clock, Calendar, Star } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import StarRating from '@/components/ui/StarRating';
import Link from 'next/link';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

export default async function StudentCourseViewPage({ params }: PageProps<'/student/courses/[id]'>) {
  const { id } = await params;
  const session = await getSession();
  const course = await getCourseById(id);
  if (!course) notFound();

  const enrollments = await getEnrollmentsByStudent(session!.id);
  const enrollment = enrollments.find(e => e.courseId === id);
  if (!enrollment) notFound();

  const announcements = await getCourseAnnouncements(id);
  const instructor = await getUserById(course.instructorId);
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
      <div>
        <h1 className="text-2xl font-black text-white">{course.title}</h1>
        <div className="flex items-center gap-3 mt-1 text-sm text-muted flex-wrap">
          {instructor && <span>Instructor: <span className="text-primary">{instructor.name}</span></span>}
          <span>·</span>
          <span>{totalSessions} classes</span>
          <span>·</span>
          <span>{uploadedCount} recording{uploadedCount !== 1 ? 's' : ''} available</span>
        </div>
      </div>

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
                <Award className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-white font-bold text-lg">🎉 Course Completed!</p>
                <p className="text-muted text-sm mt-1">Congratulations! You are eligible for a certificate. Your certificate is being prepared and will be available soon in your <Link href="/student/certificates" className="text-primary hover:underline">Certificates</Link> section.</p>
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
                <p className="text-white font-bold">Course Completed</p>
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

      {/* ── Instructor Class Review (public) ── */}
      {course.isCompleted && course.instructorClassReview && (
        <Card className="border-primary/20">
          <div className="flex items-start gap-3">
            <img src={instructor?.avatar || ''} alt={instructor?.name} className="w-10 h-10 rounded-full border border-primary/30 flex-shrink-0" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="text-white font-semibold text-sm">{instructor?.name}</p>
                <span className="text-muted text-xs">· Instructor's Final Review</span>
                <StarRating rating={course.instructorClassReview.rating} size="sm" />
              </div>
              <p className="text-muted text-sm leading-relaxed">"{course.instructorClassReview.comment}"</p>
              <p className="text-muted text-xs mt-2">{formatDateShort(course.instructorClassReview.submittedAt)}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Zoom link */}
      {course.zoomLink ? (
        <div className="bg-gradient-to-r from-blue-500/15 to-transparent border border-blue-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0"><Video className="w-5 h-5 text-blue-400" /></div>
          <div className="flex-1">
            <p className="text-white font-bold text-sm">Live Class — Zoom</p>
            <p className="text-muted text-xs mt-0.5">
              {course.schedule ? `${scheduleDays.slice(0,3).join(', ')}${scheduleDays.length > 3 ? '...' : ''} at ${course.schedule.classTime}` : 'Check announcements for class timings'}
            </p>
          </div>
          {!course.isCompleted && (
            <a href={course.zoomLink} target="_blank" rel="noopener noreferrer">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white border-0 flex-shrink-0"><ExternalLink className="w-4 h-4" />Join Live Class</Button>
            </a>
          )}
          {course.isCompleted && <Badge variant="muted">Course Ended</Badge>}
        </div>
      ) : (
        <div className="bg-dark-card border border-dark-border rounded-xl p-3 flex items-center gap-3 text-muted text-sm">
          <Video className="w-4 h-4" />Zoom link not set. Contact your instructor.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Sessions & Recordings */}
        <div className="lg:col-span-2 space-y-4">
          {/* Schedule info strip */}
          {course.schedule && (
            <div className="bg-dark-card border border-dark-border rounded-xl p-4">
              <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" />Class Schedule</h3>
              <div className="grid sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-dark-border/30 rounded-lg p-3">
                  <p className="text-muted mb-1">Time</p>
                  <p className="text-white font-medium flex items-center gap-1"><Clock className="w-3 h-3" />{course.schedule.classTime}</p>
                </div>
                <div className="bg-dark-border/30 rounded-lg p-3">
                  <p className="text-muted mb-1">Duration</p>
                  <p className="text-white font-medium">{course.schedule.classDuration}</p>
                </div>
                <div className="bg-dark-border/30 rounded-lg p-3">
                  <p className="text-muted mb-1">Days</p>
                  <p className="text-white font-medium capitalize">{course.schedule.scheduleType.replace('-', ' ')}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {scheduleDays.map(day => (
                  <span key={day} className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{day}</span>
                ))}
              </div>
              {course.schedule.notes && <p className="text-muted text-xs mt-2 italic">{course.schedule.notes}</p>}
            </div>
          )}

          {/* Class sessions */}
          <h2 className="text-white font-bold">Class Sessions</h2>
          {course.modules.length === 0 ? (
            <Card className="py-10 text-center">
              <BookOpen className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-muted text-sm">Curriculum coming soon — your instructor is setting it up.</p>
            </Card>
          ) : course.modules.map(mod => (
            <Card key={mod.id} className="p-0 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3 bg-dark-border/30">
                <BookOpen className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-white text-sm">{mod.title}</h3>
                <span className="text-xs text-muted ml-auto">{mod.lessons.filter(l => l.driveRecordingUrl).length}/{mod.lessons.length} recorded</span>
              </div>
              <div className="divide-y divide-dark-border">
                {mod.lessons.map((ses, si) => {
                  const hasRec = !!ses.driveRecordingUrl;
                  return (
                    <div key={ses.id} className="px-5 py-4">
                      <div className="flex items-start gap-3 mb-3">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${hasRec ? 'bg-green-500/20 text-green-400' : 'bg-dark-border text-muted'}`}>{si + 1}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-white text-sm font-medium">{ses.title}</p>
                            {hasRec ? <Badge variant="success">Recorded</Badge> : <Badge variant="muted">Pending</Badge>}
                          </div>
                          {ses.description && <p className="text-muted text-xs mt-0.5">{ses.description}</p>}
                          {ses.date && <p className="text-muted text-xs mt-0.5">{formatDateShort(ses.date)}{ses.duration ? ` · ${ses.duration}` : ''}</p>}
                        </div>
                      </div>
                      <div className="ml-10">
                        {hasRec ? (
                          <a href={ses.driveRecordingUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-medium text-green-400 bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 rounded-lg px-4 py-2 transition-all">
                            <ExternalLink className="w-4 h-4" />Watch Recording (Google Drive)
                          </a>
                        ) : (
                          <div className="flex items-center gap-2 text-xs text-muted bg-dark-border/30 rounded-lg px-3 py-2 w-fit">
                            <Lock className="w-3.5 h-3.5" />Recording will appear here after the live class
                          </div>
                        )}
                        {ses.materials && ses.materials.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {ses.materials.map((mat, mi) => (
                              <a key={mi} href={mat.url}
                                className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-white bg-dark-border/30 rounded-lg px-3 py-1.5 border border-dark-border">
                                <Download className="w-3 h-3" />{mat.name}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <img src={course.thumbnail} alt={course.title} className="w-full h-28 object-cover rounded-lg mb-3" />
            <div className="space-y-1.5 text-xs text-muted">
              <p>Category: <span className="text-white">{course.category}</span></p>
              <p>Level: <span className="text-white capitalize">{course.level}</span></p>
              <p>Total Classes: <span className="text-white">{totalSessions}</span></p>
              <p>Recordings: <span className="text-green-400 font-medium">{uploadedCount} available</span></p>
              <p>Status: <span className={course.isCompleted ? 'text-green-400 font-medium' : 'text-primary font-medium'}>{course.isCompleted ? 'Completed' : 'Active'}</span></p>
            </div>
          </Card>
          {instructor && (
            <Card>
              <h3 className="font-semibold text-white text-sm mb-3">Your Instructor</h3>
              <div className="flex items-center gap-3">
                <img src={instructor.avatar || ''} alt={instructor.name} className="w-10 h-10 rounded-full border border-primary/30" />
                <div>
                  <p className="text-white font-medium text-sm">{instructor.name}</p>
                  <p className="text-muted text-xs">{instructor.expertise?.slice(0, 2).join(' · ')}</p>
                </div>
              </div>
            </Card>
          )}
          {announcements.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-3"><Bell className="w-4 h-4 text-primary" /><h3 className="font-semibold text-white text-sm">Announcements</h3></div>
              <div className="space-y-3">
                {announcements.map(ann => (
                  <div key={ann.id} className="border-l-2 border-primary/40 pl-3">
                    <p className="text-white text-xs font-medium">{ann.title}</p>
                    <p className="text-muted text-xs mt-0.5 line-clamp-2">{ann.content}</p>
                    <p className="text-muted text-xs mt-1">{formatDateShort(ann.createdAt)}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
