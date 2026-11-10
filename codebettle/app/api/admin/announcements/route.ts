import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireRoles, serviceError } from '@/lib/api-helpers';
import { z } from 'zod';
import { createAnnouncement, listAnnouncements } from '@/lib/db/announcements';
import { onAnnouncementPublished } from '@/lib/services/notification-service';
import { getCourseById } from '@/lib/db/courses';

/**
 * Announcements API (Phase 4 gap, closed in Phase 5).
 *
 * POST /api/admin/announcements — admin creates an announcement, and the
 * notification hook fires right after (course announcements -> enrolled
 * students, site-wide -> every user). Best-effort: a notification failure
 * never blocks the announcement itself.
 *
 * GET /api/admin/announcements — list all announcements (admin only).
 */
const announcementCreateSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  type: z.enum(['site-wide', 'course']),
  courseId: z.string().optional(),
});

export async function GET() {
  const auth = await requireRoles(['admin']);
  if ('error' in auth) return auth.error;
  const announcements = await listAnnouncements();
  return NextResponse.json({ announcements });
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(['admin']);
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = announcementCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Title, content and type are required' }, { status: 400 });
  }
  const { title, content, type, courseId } = parsed.data;
  if (type === 'course') {
    if (!courseId) {
      return NextResponse.json({ error: 'A course is required for a course announcement' }, { status: 400 });
    }
    const course = await getCourseById(courseId);
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
  }
  const announcement = await createAnnouncement({
    title,
    content,
    type,
    courseId: type === 'course' ? courseId : undefined,
    authorId: auth.session.id,
  });
  // Wire the notification hook (Phase 4 gap). Best-effort — never blocks.
  try {
    await onAnnouncementPublished(announcement);
  } catch {
    // Notifications are in-app and best-effort; the announcement stands.
  }
  return NextResponse.json({ announcement }, { status: 201 });
}
