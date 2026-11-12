import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { hasTeacherCapability } from '@/lib/rbac';
import { getUnreadCount, listNotificationsForUser } from '@/lib/db/notifications';
import { getUserNotificationPrefs } from '@/lib/db/users';
import InstructorNotificationsClient from './instructor-notifications-client';

/**
 * Instructor notifications — server wrapper (Phase 4).
 * Fetches the signed-in instructor's real notifications (newest first,
 * paginated) plus their unread count and preferences on the server.
 */
export default async function InstructorNotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  await connection();
  const session = await getSession();
  if (!session || !hasTeacherCapability(session)) redirect('/auth/login');
  const params = (await searchParams) ?? {};
  const page = await listNotificationsForUser(session.id, { page: params.page });
  const [unreadCount, preferences] = await Promise.all([
    getUnreadCount(session.id),
    getUserNotificationPrefs(session.id),
  ]);
  return (
    <InstructorNotificationsClient
      initialNotifications={page.items}
      initialUnreadCount={unreadCount}
      initialPage={page.page}
      initialTotalPages={page.totalPages}
      initialPreferences={
        preferences ?? {
          inApp: true,
          email: false,
          events: { enrollment: true, completion: true, certificate: true, application: true, announcement: true, support_request: true, request_update: true },
        }
      }
    />
  );
}
