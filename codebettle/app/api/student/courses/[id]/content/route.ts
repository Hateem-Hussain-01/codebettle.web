import { NextRequest, NextResponse } from 'next/server';
import { requireRoles } from '@/lib/api-helpers';
import { getCourseById } from '@/lib/db/courses';
import { getEnrollmentsByStudent } from '@/lib/db/enrollments';

/**
 * GET /api/student/courses/[id]/content — the gated course content for
 * one enrolled student (Phase 0a recording-leak fix).
 *
 * The public course payload (GET /api/courses, GET /api/courses/[slug],
 * /courses pages) carries NO Zoom link, recording URL or materials URL
 * — those are bearer links, so they must never leak to anonymous
 * visitors. An enrolled student with a confirmed payment fetches them
 * here instead. Checks, in order:
 *   1. signed in as a student (401 / 403),
 *   2. the course exists (404),
 *   3. the student is enrolled in it (404 — same as the student course
 *      page, which notFound()s for non-enrolled students),
 *   4. paymentStatus is 'paid' or 'free' — a 'pending' enrolment gets
 *      403 and sees only the locked states on the student course page.
 * Response: { courseId, zoomLink, lessons: [{ lessonId, recordingUrl,
 * materials: [{ name, url }] }] } — one entry per lesson, so the client
 * can map content onto the public curriculum by lesson id.
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
  if (enrollment.paymentStatus !== 'paid' && enrollment.paymentStatus !== 'free') {
    return NextResponse.json(
      { error: 'Payment not confirmed yet — recordings and materials unlock once an admin confirms your payment' },
      { status: 403 },
    );
  }
  return NextResponse.json({
    courseId: course.id,
    zoomLink: course.zoomLink,
    lessons: course.modules.flatMap((mod) =>
      mod.lessons.map((lesson) => ({
        lessonId: lesson.id,
        recordingUrl: lesson.driveRecordingUrl,
        materials: lesson.materials,
      })),
    ),
  });
}
