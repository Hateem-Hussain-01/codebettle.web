/**
 * Announcement repository (Phase 2, Prisma-backed).
 *
 * Same function names as the old lib/data/announcements.ts. Site-wide
 * announcements are the broadcast channel; course announcements are
 * scoped to one course. Only active announcements are shown to students.
 */
import { getDb } from './client';
import { announcementTypeToStorage, mapAnnouncementRow } from './mappers';
import type { Announcement, AnnouncementType } from './types';

export async function getSiteWideAnnouncements(): Promise<Announcement[]> {
  const rows = await getDb()
    .orm.public.Announcement.where({ type: 'site_wide' })
    .where((a) => a.isActive.eq(true))
    .orderBy((a) => a.createdAt.desc())
    .all();
  return rows.map(mapAnnouncementRow);
}

export async function getCourseAnnouncements(courseId: string): Promise<Announcement[]> {
  const rows = await getDb()
    .orm.public.Announcement.where({ courseId })
    .where((a) => a.isActive.eq(true))
    .orderBy((a) => a.createdAt.desc())
    .all();
  return rows.map(mapAnnouncementRow);
}

export async function listAnnouncements(): Promise<Announcement[]> {
  const rows = await getDb()
    .orm.public.Announcement.orderBy((a) => a.createdAt.desc())
    .all();
  return rows.map(mapAnnouncementRow);
}

export interface CreateAnnouncementInput {
  title: string;
  content: string;
  type: AnnouncementType;
  courseId?: string;
  authorId: string;
}

export async function createAnnouncement(input: CreateAnnouncementInput): Promise<Announcement> {
  const row = await getDb().orm.public.Announcement.create({
    title: input.title,
    content: input.content,
    type: announcementTypeToStorage(input.type),
    courseId: input.courseId ?? null,
    authorId: input.authorId,
    isActive: true,
  });
  return mapAnnouncementRow(row);
}

export async function getAnnouncementById(id: string): Promise<Announcement | null> {
  const row = await getDb().orm.public.Announcement.where({ id }).first();
  if (!row) return null;
  return mapAnnouncementRow(row);
}

export async function deleteAnnouncement(id: string): Promise<boolean> {
  const row = await getDb().orm.public.Announcement.where({ id }).first();
  if (!row) return false;
  await getDb().orm.public.Announcement.where({ id }).delete();
  return true;
}
