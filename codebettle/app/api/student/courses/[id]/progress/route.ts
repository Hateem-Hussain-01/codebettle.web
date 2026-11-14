import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireRoles } from '@/lib/api-helpers';
import { getCourseById } from '@/lib/db/courses';
import {
  getEnrollmentsByStudent,
  markLessonComplete,
  unmarkLessonComplete,
} from '@/lib/db/enrollments';
import { summarizeCourseProgress } from '@/lib/services/progress-service';

/**
 * GET /api/student/courses/[id]/progress — the progress state for one
 * enrolled student in one course (Student Progress Tracking).
 *
 * Checks, in order (same as the gated content endpoint):
 *   1. signed in as a student (401 / 403),
 *   2. the course exists (404),
 *   3. the student is enrolled in it (404).
 * Response: { enrollmentId, courseId, completedLessonIds, totalLessons,
 * completedCount, percent, nextLesson } — nextLesson is the first
 * incomplete lesson in curriculum order (null when the course is
 * complete). Fail-safe: when the LessonProgress table does not exist
 * yet, the enrolment reads as 0% with no completed lessons instead of
 * crashing (the table arrives with the init migration, but a fresh
 * database that has not run it yet must not 500 here).
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
  let enrollment;
  try {
    const enrollments = await getEnrollmentsByStudent(auth.session.id);
    enrollment = enrollments.find((e) => e.courseId === id);
  } catch (error) {
    // LessonProgress table missing (42P01) or a progress column missing
    // (42703): the student is enrolled, but no progress exists yet.
    if (isMissingTableOrColumn(error, 'LessonProgress')) {
      return NextResponse.json({
        enrollmentId: null,
        courseId: course.id,
        completedLessonIds: [],
        totalLessons: course.modules.flatMap((m) => m.lessons).length,
        completedCount: 0,
        percent: 0,
        nextLesson: null,
      });
    }
    throw error;
  }
  if (!enrollment) {
    return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 404 });
  }
  const summary = summarizeCourseProgress(course.modules, enrollment.completedLessons);
  return NextResponse.json({
    enrollmentId: enrollment.id,
    courseId: course.id,
    completedLessonIds: enrollment.completedLessons,
    totalLessons: summary.totalLessons,
    completedCount: summary.completedCount,
    percent: summary.percent,
    nextLesson: summary.nextLesson,
  });
}

/**
 * POST /api/student/courses/[id]/progress — mark or unmark one lesson
 * complete for the signed-in student. Body: { lessonId, completed }.
 * Same checks as GET, plus: the lesson must belong to this course
 * (a lesson id from another course is rejected). Returns the updated
 * progress state (same shape as GET) so the client can update in place.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  if (body === null || typeof body !== 'object') return invalidBody();
  const { lessonId, completed } = body as Record<string, unknown>;
  if (typeof lessonId !== 'string' || lessonId.length === 0 || typeof completed !== 'boolean') {
    return invalidBody('Expected { lessonId, completed }');
  }
  const course = await getCourseById(id);
  if (!course) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  }
  const lessonBelongsToCourse = course.modules.some((m) => m.lessons.some((l) => l.id === lessonId));
  if (!lessonBelongsToCourse) {
    return NextResponse.json({ error: 'Lesson not found in this course' }, { status: 404 });
  }
  const enrollments = await getEnrollmentsByStudent(auth.session.id);
  const enrollment = enrollments.find((e) => e.courseId === id);
  if (!enrollment) {
    return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 404 });
  }
  const result = completed
    ? await markLessonComplete(enrollment.id, lessonId)
    : await unmarkLessonComplete(enrollment.id, lessonId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const completedLessonIds = completed
    ? [...new Set([...enrollment.completedLessons, lessonId])]
    : enrollment.completedLessons.filter((l) => l !== lessonId);
  const summary = summarizeCourseProgress(course.modules, completedLessonIds);
  return NextResponse.json({
    enrollmentId: enrollment.id,
    courseId: course.id,
    completedLessonIds,
    totalLessons: summary.totalLessons,
    completedCount: summary.completedCount,
    percent: summary.percent,
    nextLesson: summary.nextLesson,
  });
}

/** True when the error is a missing table (42P01) or a missing column (42703) for the named table. */
function isMissingTableOrColumn(error: unknown, table: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = typeof (error as { message?: unknown }).message === 'string' ? (error as { message: string }).message : '';
  const namesTable = message.includes(`"${table}"`) || message.includes(table);
  return ((code === '42P01' || code === '42703') && namesTable) || (/relation .* does not exist/i.test(message) && namesTable);
}
