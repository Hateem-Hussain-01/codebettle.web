import { NextRequest, NextResponse } from 'next/server';
import { requireRoles } from '@/lib/api-helpers';
import { getCourseById } from '@/lib/db/courses';
import { getEnrollmentsByStudent } from '@/lib/db/enrollments';

/**
 * How many introductory lessons a student may watch before their
 * payment is verified (Phase 1d).
 *
 * PRODUCT DECISION (Eman can adjust): pre-verification access is the
 * FIRST 2 lessons in curriculum order — not a per-course setting.
 * A later change could make this a per-course intro-lesson count
 * (e.g. `Course.introLessonCount`); until then the number lives here
 * in one place so the endpoint and the student page agree.
 */
export const PRE_VERIFICATION_LESSON_LIMIT = 2;

/**
 * GET /api/student/courses/[id]/content — the gated course content for
 * one enrolled student (Phase 0a recording-leak fix, extended in
 * Phase 1d for pre-verification access).
 *
 * The public course payload (GET /api/courses, GET /api/courses/[slug],
 * /courses pages) carries NO Zoom link, recording URL or materials URL
 * — those are bearer links, so they must never leak to anonymous
 * visitors. An enrolled student fetches them here instead. Checks, in
 * order:
 *   1. signed in as a student (401 / 403),
 *   2. the course exists (404),
 *   3. the student is enrolled in it (404 — same as the student course
 *      page, which notFound()s for non-enrolled students).
 * Then, by paymentStatus:
 *   - 'paid' / 'free' — everything: Zoom link, every lesson's
 *     recording URL and materials.
 *   - 'pending' — ONLY the first PRE_VERIFICATION_LESSON_LIMIT
 *     lessons (in curriculum order) with their recording/materials
 *     URLs; the rest are returned locked (`locked: true`, no URLs)
 *     and the Zoom link is withheld (empty string). The student page
 *     renders the locked lessons with a lock icon.
 * Response: { courseId, paymentStatus, zoomLink, lessons:
 * [{ lessonId, recordingUrl, materials: [{ name, url }], locked }] }
 * — one entry per lesson, so the client can map content onto the
 * public curriculum by lesson id.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const course = await getCourseById(id);
  if (!course) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  }
  const enrollments = await getEnrollmentsByStudent(auth.session.id);
  const enrollment = enrollments.find((e) => e.courseId === id);
  if (!enrollment) {
    return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 404 });
  }
  const verified = enrollment.paymentStatus === 'paid' || enrollment.paymentStatus === 'free';
  const allLessons = course.modules.flatMap((mod) => mod.lessons);
  const lessons = allLessons.map((lesson, index) => {
    const unlocked = verified || index < PRE_VERIFICATION_LESSON_LIMIT;
    return {
      lessonId: lesson.id,
      recordingUrl: unlocked ? lesson.driveRecordingUrl : '',
      materials: unlocked ? lesson.materials : [],
      locked: !unlocked,
    };
  });
  return NextResponse.json({
    courseId: course.id,
    paymentStatus: enrollment.paymentStatus,
    zoomLink: verified ? course.zoomLink : '',
    lessons,
  });
}
