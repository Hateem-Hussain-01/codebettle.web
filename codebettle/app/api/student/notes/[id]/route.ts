import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireRoles } from '@/lib/api-helpers';
import { deleteNoteForUser, updateNoteForUser } from '@/lib/db/notes';
import { getCourseById } from '@/lib/db/courses';

/**
 * PATCH /api/student/notes/[id] — edit your own note. Body: any of
 * { title, content, courseId } (courseId: null unlinks the course).
 * DELETE /api/student/notes/[id] — delete your own note.
 * Both are scoped by session id in the repository: another student's
 * note reads as not found (404), never as their row.
 */
const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(10000).optional(),
  courseId: z.string().min(1).nullable().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return invalidBody('Nothing valid to update');
  if (parsed.data.courseId) {
    const course = await getCourseById(parsed.data.courseId);
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  }
  const note = await updateNoteForUser(auth.session.id, id, parsed.data);
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  return NextResponse.json({ note });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const deleted = await deleteNoteForUser(auth.session.id, id);
  if (!deleted) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
