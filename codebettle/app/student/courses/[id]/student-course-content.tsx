'use client';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { formatDateShort } from '@/lib/utils';
import { ExternalLink, Download, BookOpen, Video, Lock, Calendar, Clock } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import FadeIn from '@/components/ui/FadeIn';
import type { PublicCourse } from '@/lib/db/types';

/**
 * Student course content — Zoom link, recordings and materials (Phase 0a).
 *
 * The server page hands this component ONLY the public course shape
 * (toPublicCourse: no Zoom link, no recording URLs, no materials URLs).
 * The gated content is fetched from GET /api/student/courses/[id]/content,
 * which checks the session, the enrolment and that paymentStatus is
 * 'paid' or 'free' before returning anything. While payment is pending
 * no fetch is made at all — every link renders in its locked state.
 * Lesson titles/descriptions/dates are public curriculum data; only the
 * recording URL and materials URLs come from the gated endpoint, mapped
 * onto the public lessons by lesson id.
 */
export interface LessonContent {
  lessonId: string;
  recordingUrl: string;
  materials: { name: string; url: string }[];
}

interface StudentCourseContentProps {
  courseId: string;
  modules: PublicCourse['modules'];
  schedule: PublicCourse['schedule'];
  scheduleDays: string[];
  isCompleted: boolean;
  /** True while the enrolment payment is pending — content stays locked, no fetch is made. */
  paymentPending: boolean;
  /** Server-rendered sidebar (instructor card, announcements) — rendered inside the grid. */
  children: ReactNode;
}

export default function StudentCourseContent({
  courseId,
  modules,
  schedule,
  scheduleDays,
  isCompleted,
  paymentPending,
  children,
}: StudentCourseContentProps) {
  const [content, setContent] = useState<{ zoomLink: string; lessons: LessonContent[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (paymentPending) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/student/courses/${courseId}/content`);
        if (!res.ok) {
          if (!cancelled) setFailed(true);
          return;
        }
        const data = (await res.json()) as { zoomLink: string; lessons: LessonContent[] };
        if (!cancelled) setContent(data);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, paymentPending]);

  const byLesson = new Map((content?.lessons ?? []).map((l) => [l.lessonId, l]));
  /** null while the gated content is still loading (and not pending). */
  const recordedCount = (lessons: PublicCourse['modules'][number]['lessons']) =>
    content ? lessons.filter((l) => byLesson.get(l.id)?.recordingUrl).length : null;

  return (
    <>
      {/* Zoom link — withheld while payment is pending */}
      {paymentPending ? (
        <div className="bg-gradient-to-r from-yellow-500/15 to-transparent border border-yellow-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center flex-shrink-0"><Lock className="w-5 h-5 text-yellow-400" /></div>
          <div className="flex-1">
            <p className="text-white font-bold text-sm">Payment pending</p>
            <p className="text-muted text-xs mt-0.5">You are enrolled, but your payment has not been confirmed yet. The Zoom link, recordings and materials unlock once an admin confirms your payment.</p>
          </div>
        </div>
      ) : failed ? (
        <div className="bg-dark-card border border-dark-border rounded-xl p-3 flex items-center gap-3 text-muted text-sm">
          <Video className="w-4 h-4" />Could not load the class links — please refresh the page.
        </div>
      ) : content === null ? (
        <div className="bg-dark-card border border-dark-border rounded-xl p-3 flex items-center gap-3 text-muted text-sm">
          <Video className="w-4 h-4" />Loading class links…
        </div>
      ) : content.zoomLink ? (
        <div className="bg-gradient-to-r from-blue-500/15 to-transparent border border-blue-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0"><Video className="w-5 h-5 text-blue-400" /></div>
          <div className="flex-1">
            <p className="text-white font-bold text-sm">Live Class — Zoom</p>
            <p className="text-muted text-xs mt-0.5">
              {schedule ? `${scheduleDays.slice(0, 3).join(', ')}${scheduleDays.length > 3 ? '...' : ''} at ${schedule.classTime}` : 'Check announcements for class timings'}
            </p>
          </div>
          {!isCompleted && (
            <a href={content.zoomLink} target="_blank" rel="noopener noreferrer">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white border-0 flex-shrink-0"><ExternalLink className="w-4 h-4" />Join Live Class</Button>
            </a>
          )}
          {isCompleted && <Badge variant="muted">Course Ended</Badge>}
        </div>
      ) : (
        <div className="bg-dark-card border border-dark-border rounded-xl p-3 flex items-center gap-3 text-muted text-sm">
          <Video className="w-4 h-4" />Zoom link not set. Contact your instructor.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Sessions & Recordings */}
        <FadeIn delay={0.05} className="lg:col-span-2 space-y-4">
          {/* Schedule info strip */}
          {schedule && (
            <div className="bg-dark-card border border-dark-border rounded-xl p-4">
              <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" />Class Schedule</h3>
              <div className="grid sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-dark-border/30 rounded-lg p-3">
                  <p className="text-muted mb-1">Time</p>
                  <p className="text-white font-medium flex items-center gap-1"><Clock className="w-3 h-3" />{schedule.classTime}</p>
                </div>
                <div className="bg-dark-border/30 rounded-lg p-3">
                  <p className="text-muted mb-1">Duration</p>
                  <p className="text-white font-medium">{schedule.classDuration}</p>
                </div>
                <div className="bg-dark-border/30 rounded-lg p-3">
                  <p className="text-muted mb-1">Days</p>
                  <p className="text-white font-medium capitalize">{schedule.scheduleType.replace('-', ' ')}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {scheduleDays.map((day) => (
                  <span key={day} className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{day}</span>
                ))}
              </div>
              {schedule.notes && <p className="text-muted text-xs mt-2 italic">{schedule.notes}</p>}
            </div>
          )}

          {/* Class sessions */}
          <h2 className="text-white font-bold">Class Sessions</h2>
          {modules.length === 0 ? (
            <Card className="py-10 text-center">
              <BookOpen className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-muted text-sm">Curriculum coming soon — your instructor is setting it up.</p>
            </Card>
          ) : modules.map((mod) => {
            const recorded = recordedCount(mod.lessons);
            return (
              <Card key={mod.id} className="p-0 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3 bg-dark-border/30">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-white text-sm">{mod.title}</h3>
                  <span className="text-xs text-muted ml-auto">{recorded === null ? '…' : recorded}/{mod.lessons.length} recorded</span>
                </div>
                <div className="divide-y divide-dark-border">
                  {mod.lessons.map((ses, si) => {
                    const gated = byLesson.get(ses.id);
                    const hasRec = !!gated?.recordingUrl;
                    const materials = gated?.materials ?? [];
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
                          {paymentPending || content === null ? (
                            <div className="flex items-center gap-2 text-xs text-muted bg-dark-border/30 rounded-lg px-3 py-2 w-fit">
                              <Lock className="w-3.5 h-3.5" />
                              {paymentPending
                                ? 'Recording locked until your payment is confirmed'
                                : 'Loading recording…'}
                            </div>
                          ) : hasRec ? (
                            <a href={gated.recordingUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-sm font-medium text-green-400 bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 rounded-lg px-4 py-2 transition-all">
                              <ExternalLink className="w-4 h-4" />Watch Recording (Google Drive)
                            </a>
                          ) : (
                            <div className="flex items-center gap-2 text-xs text-muted bg-dark-border/30 rounded-lg px-3 py-2 w-fit">
                              <Lock className="w-3.5 h-3.5" />Recording will appear here after the live class
                            </div>
                          )}
                          {!paymentPending && content !== null && materials.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {materials.map((mat, mi) => (
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
            );
          })}
        </FadeIn>

        {children}
      </div>
    </>
  );
}
