import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireRoles } from '@/lib/api-helpers';
import { createNote, listNotesForUser } from '@/lib/db/notes';
import { getCourseById, getCoursesByIds } from '@/lib/db/courses';
import { getEnrollmentsByStudent } from '@/lib/db/enrollments';

/**
 * GET /api/student/notes — your own notes, newest first (Phase 0d,
 * Module 4). Each note carries the linked course's title (when linked)
 * so the UI can show it without a second lookup. `courses` is the
 * student's enrolled courses, for the create/edit course picker.
 * POST /api/student/notes — create a note. Body: { title, content,
 * courseId? }. The userId always comes from the session, never the body.
 */
const noteSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  courseId: z.string().min(1).optional(),
});

export async function GET() {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const notes = await listNotesForUser(auth.session.id);
  const linkedIds = [...new Set(notes.map((n) => n.courseId).filter((id): id is string => Boolean(id)))];
  const linkedCourses = await getCoursesByIds(linkedIds);
  const titles = new Map(linkedCourses.map((c) => [c.id, c.title]));
  const enrollments = await getEnrollmentsByStudent(auth.session.id);
  const enrolledCourses = await getCoursesByIds(enrollments.map((e) => e.courseId));
  return NextResponse.json({
    notes: notes.map((n) => ({ ...n, courseTitle: n.courseId ? (titles.get(n.courseId) ?? undefined) : undefined })),
    courses: enrolledCourses.map((c) => ({ id: c.id, title: c.title })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) return invalidBody('A title and content are required');
  if (parsed.data.courseId) {
    const course = await getCourseById(parsed.data.courseId);
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  }
  const note = await createNote({ userId: auth.session.id, ...parsed.data });
  return NextResponse.json({ note }, { status: 201 });
}
