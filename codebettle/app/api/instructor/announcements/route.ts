import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertNotViewAs, invalidBody, readJson, requireRoles } from '@/lib/api-helpers';
import { createAnnouncement } from '@/lib/db/announcements';
import { getCourseById } from '@/lib/db/courses';
import { onAnnouncementPublished } from '@/lib/services/notification-service';

/**
 * POST /api/instructor/announcements — an instructor posts a course
 * announcement (Phase 7; the instructor page used to fake it).
 * Body: { title, content, courseId }. The course must exist AND belong
 * to the instructor — an instructor can only announce to their own
 * courses. The notification hook fires after creation (enrolled
 * students are notified), best-effort like the admin route.
 */
const instructorAnnouncementSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  courseId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const auth = await requireRoles(['instructor']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  // Phase 0b: the whole handler body is wrapped so a database/validation
  // failure returns a parseable JSON 500 instead of Next's HTML error
  // page (which the client could not parse and which surfaced as a
  // crash/logout in the announcement flow).
  try {
    const body = await readJson(request);
    // INST-03: ownership BEFORE body validation. The courseId is the only
    // field the check needs, so read it from the raw body first: a
    // courseId naming someone else's course gets 403 even when
    // title/content are missing. Without a usable courseId there is
    // nothing to check ownership against, so the full schema validation
    // (400) runs instead.
    const rawCourseId = (body as { courseId?: unknown } | null)?.courseId;
    let course: Awaited<ReturnType<typeof getCourseById>> = null;
    if (typeof rawCourseId === 'string' && rawCourseId) {
      course = await getCourseById(rawCourseId);
      if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
      if (course.instructorId !== auth.session.id) {
        return NextResponse.json({ error: 'You can only announce to your own courses' }, { status: 403 });
      }
    }
    const parsed = instructorAnnouncementSchema.safeParse(body);
    if (!parsed.success) return invalidBody('Title, content and course are required');
    const { title, content, courseId } = parsed.data;
    // A valid parse always carries a courseId, so the pre-check above
    // already loaded it; re-fetch only if it was somehow skipped.
    if (!course) {
      course = await getCourseById(courseId);
      if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
    const announcement = await createAnnouncement({
      title,
      content,
      type: 'course',
      courseId,
      authorId: auth.session.id,
    });
    try {
      await onAnnouncementPublished(announcement);
    } catch {
      // Notifications are in-app and best-effort; the announcement stands.
    }
    return NextResponse.json({ announcement }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create announcement' }, { status: 500 });
  }
}
