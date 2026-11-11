import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import { z } from 'zod';
import { sendAdminNotification } from '@/lib/services/notification-service';
import { getCourseById } from '@/lib/db/courses';
import { getUserById } from '@/lib/db/users';
import { logAudit } from '@/lib/db/audit';

/**
 * POST /api/admin/notifications — admin broadcast send (Phase 3).
 *
 * Guard: requireAdminArea('notifications') — the 'notifications' area
 * exists in ADMIN_AREAS (In-app notifications), so a restricted admin
 * needs that area granted; full admins pass. ('announcements' was not
 * used: this endpoint is not an announcement — it sends notifications
 * directly, with no Announcement row.)
 *
 * Body: {
 *   title: string, body: string,
 *   category: 'general' | 'important' | 'warning' | 'special_notice',
 *   target: { type: 'all' }
 *         | { type: 'role', role: 'student' | 'instructor' | 'admin' }
 *         | { type: 'user', userId: string }
 *         | { type: 'course', courseId: string },
 *   requiresAcknowledge?: boolean, linkUrl?: string
 * }
 * Creates one Notification row per recipient. important /
 * special_notice categories bypass the per-event prefs toggle (see
 * notification-service.ts) — they must reach everyone, otherwise the
 * acknowledge gate is meaningless.
 *
 * Returns { created: n, skipped: n } (skipped = recipients whose
 * prefs turned the notification off; failed recipients are not
 * counted as created). The send is audit-logged.
 */
const targetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }),
  z.object({ type: z.literal('role'), role: z.enum(['student', 'instructor', 'admin']) }),
  z.object({ type: z.literal('user'), userId: z.string().min(1) }),
  z.object({ type: z.literal('course'), courseId: z.string().min(1) }),
]);

const adminSendSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  category: z.enum(['general', 'important', 'warning', 'special_notice']),
  target: targetSchema,
  requiresAcknowledge: z.boolean().optional(),
  linkUrl: z.string().trim().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('notifications');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = adminSendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Title, body, category and target are required' },
      { status: 400 },
    );
  }
  const { title, body: text, category, target, requiresAcknowledge, linkUrl } = parsed.data;
  if (target.type === 'user') {
    const user = await getUserById(target.userId);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  if (target.type === 'course') {
    const course = await getCourseById(target.courseId);
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  }
  if (linkUrl !== undefined && linkUrl !== '') {
    try {
      const url = new URL(linkUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return NextResponse.json({ error: 'linkUrl must be an http(s) URL' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'linkUrl must be a valid URL' }, { status: 400 });
    }
  }
  const summary = await sendAdminNotification({
    title,
    body: text,
    category,
    target,
    requiresAcknowledge: requiresAcknowledge ?? false,
    linkUrl: linkUrl || undefined,
  });
  await logAudit({
    actorId: auth.session.id,
    action: 'admin.notification.send',
    entity: 'Notification',
    detail: `${category} -> ${target.type}${target.type === 'role' ? `:${target.role}` : ''}: ${title} (created ${summary.sent}, skipped ${summary.skipped})`,
  });
  return NextResponse.json({ created: summary.sent, skipped: summary.skipped });
}
