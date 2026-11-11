/**
 * Communications dashboard data loader (Phase 3, Module 14 — Worker D).
 *
 * Server-only. READ/AGGREGATE ONLY: it composes the existing read
 * repositories (announcements, users, courses, enrollments) plus one
 * direct read of the Notification table. That direct read is deliberate
 * and documented:
 *
 * - No admin-wide notification list exists anywhere: lib/db/notifications
 *   only ever lists ONE user's rows (ownership-scoped by design), and
 *   that file is read-only for Worker A — do not add an admin list there.
 * - So the dashboard's own loader reads the newest Notification rows
 *   directly through getDb(), maps them with the shared mapNotificationRow,
 *   and keeps only admin-composed targeted sends (see isTargetedNotification
 *   in communications-helpers.ts). It never writes, never duplicates a
 *   notification record, and creates no new model or store.
 * - Read receipts per announcement do NOT come from here: they come from
 *   Worker A's GET /api/admin/announcements/[id]/receipts, fetched lazily
 *   by the client on expand (see communications-client.tsx). Counting reads
 *   here would duplicate that endpoint's job and fan out per announcement.
 *
 * NOTE: this module is server-only by import (only ever imported by the
 * server page app/admin/communications/page.tsx). It does NOT import
 * the 'server-only' package — that package is not installed in this
 * repo — so do not import this module from any client component.
 */
import { getDb } from '@/lib/db/client';
import { mapNotificationRow } from '@/lib/db/mappers';
import { listAnnouncements } from '@/lib/db/announcements';
import { getAllUsers } from '@/lib/db/users';
import { getAllCourses } from '@/lib/db/courses';
import { getEnrollmentsByCourseIds } from '@/lib/db/enrollments';
import {
  announcementOrigin,
  deliveryStatusOf,
  isTargetedNotification,
  isTeacherUser,
  type CommunicationsData,
  type EnrichedAnnouncement,
  type TargetedRow,
} from './communications-helpers';

/**
 * Newest targeted rows shown. The Notification table is unbounded and
 * this dashboard is an overview, not an archive — the cap keeps the
 * server render bounded (same trade-off as the unbounded listAnnouncements
 * the announcements page already uses).
 */
export const TARGETED_NOTIFICATION_LIMIT = 500;

export async function loadCommunicationsData(): Promise<CommunicationsData> {
  const [announcements, users, courses] = await Promise.all([
    listAnnouncements(),
    getAllUsers(),
    getAllCourses(),
  ]);

  const usersById = new Map(users.map((u) => [u.id, u]));
  const coursesById = new Map(courses.map((c) => [c.id, c]));

  // One batched enrolment lookup for every course announcement (no N+1).
  const courseIds = [...new Set(announcements.filter((a) => a.courseId).map((a) => a.courseId as string))];
  const enrollments = await getEnrollmentsByCourseIds(courseIds);
  const enrolledByCourse = new Map<string, Set<string>>();
  for (const enrollment of enrollments) {
    let set = enrolledByCourse.get(enrollment.courseId);
    if (!set) {
      set = new Set();
      enrolledByCourse.set(enrollment.courseId, set);
    }
    set.add(enrollment.studentId);
  }

  const enriched: EnrichedAnnouncement[] = announcements.map((announcement) => {
    const author = usersById.get(announcement.authorId);
    const course = announcement.courseId ? coursesById.get(announcement.courseId) : undefined;
    return {
      announcement,
      authorName: author?.name ?? 'Unknown author',
      authorIsTeacher: author ? isTeacherUser(author) : false,
      courseTitle: course?.title ?? null,
      recipientCount:
        announcement.type === 'site-wide'
          ? users.length
          : enrolledByCourse.get(announcement.courseId ?? '')?.size ?? 0,
      origin: announcementOrigin(author),
    };
  });

  // Admin-wide targeted rows: newest first. System-event rows and
  // announcement deliveries are excluded — they have their own tabs.
  const notificationRows = await getDb()
    .orm.public.Notification.orderBy((n) => n.createdAt.desc())
    .limit(TARGETED_NOTIFICATION_LIMIT)
    .all();
  const targeted: TargetedRow[] = notificationRows
    .map((row) => mapNotificationRow(row))
    .filter((notification) => isTargetedNotification(notification))
    .map((notification) => {
      const recipient = usersById.get(notification.userId);
      return {
        notification,
        recipientName: recipient?.name ?? 'Unknown recipient',
        recipientEmail: recipient?.email ?? '',
        recipientRole: recipient
          ? recipient.role === 'instructor' || recipient.isTeacher
            ? 'instructor'
            : recipient.role === 'admin' || recipient.isAdmin
              ? 'admin'
              : 'student'
          : 'student',
        status: deliveryStatusOf(notification),
      };
    });

  const targetedRead = targeted.filter((t) => t.status === 'read').length;

  return {
    announcements: enriched,
    targeted,
    stats: {
      totalAnnouncements: enriched.length,
      siteWideAnnouncements: enriched.filter((e) => e.announcement.type === 'site-wide').length,
      courseAnnouncements: enriched.filter((e) => e.announcement.type === 'course').length,
      teacherAuthoredAnnouncements: enriched.filter((e) => e.origin === 'teacher').length,
      targetedSent: targeted.length,
      targetedRead,
    },
  };
}
