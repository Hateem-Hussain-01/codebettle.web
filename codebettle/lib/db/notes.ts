/**
 * Note repository (Phase 0/1, Module 4).
 *
 * Replaces the hardcoded INITIAL_NOTES on the student notes page.
 * Every read/write is scoped to one userId — a user can only ever
 * see, edit or delete their own rows. Ownership is enforced here
 * (userId in the where clause), so a caller that passes another
 * user's id gets null/false, never the row.
 */
import { getDb } from './client';
import { dateToString, stripUndefined } from './mappers';
import type { Note, NoteRow } from './types';

export function mapNoteRow(row: NoteRow): Note {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    content: row.content,
    courseId: row.courseId ?? undefined,
    createdAt: dateToString(row.createdAt),
    updatedAt: dateToString(row.updatedAt),
  };
}

/** The user's notes, newest first. */
export async function listNotesForUser(userId: string): Promise<Note[]> {
  const rows = await getDb()
    .orm.public.Note.where({ userId })
    .orderBy((n) => n.createdAt.desc())
    .all();
  return rows.map(mapNoteRow);
}

/** One note, only when it belongs to this user (null otherwise). */
export async function getNoteForUser(userId: string, id: string): Promise<Note | null> {
  const row = await getDb().orm.public.Note.where({ id, userId }).first();
  if (!row) return null;
  return mapNoteRow(row);
}

export interface CreateNoteInput {
  userId: string;
  title: string;
  content: string;
  courseId?: string;
}

export async function createNote(input: CreateNoteInput): Promise<Note> {
  const row = await getDb().orm.public.Note.create({
    userId: input.userId,
    title: input.title,
    content: input.content,
    courseId: input.courseId ?? null,
  });
  return mapNoteRow(row);
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  /** Pass null to unlink the note from its course. */
  courseId?: string | null;
}

/** Update one of the user's own notes. Null when not found / not own. */
export async function updateNoteForUser(
  userId: string,
  id: string,
  input: UpdateNoteInput,
): Promise<Note | null> {
  const row = await getDb()
    .orm.public.Note.where({ id, userId })
    .update(stripUndefined({ ...input }));
  if (!row) return null;
  return getNoteForUser(userId, id);
}

/** Delete one of the user's own notes. False when not found / not own. */
export async function deleteNoteForUser(userId: string, id: string): Promise<boolean> {
  const row = await getDb().orm.public.Note.where({ id, userId }).delete();
  return row !== null;
}
