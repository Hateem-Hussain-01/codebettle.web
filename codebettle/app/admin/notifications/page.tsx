import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { hasAdminCapability } from '@/lib/rbac';
import { getUnreadCount, listNotificationsForUser } from '@/lib/db/notifications';
import { getUserNotificationPrefs } from '@/lib/db/users';
import NotificationsClient from '@/app/student/notifications/student-notifications-client';

/**
 * Admin notifications — server wrapper (Phase 4).
 * Lists the signed-in admin's own notifications via the notification
 * repository, reusing the shared notifications client.
 */
export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  await connection();
  const session = await getSession();
  if (!session || !hasAdminCapability(session)) redirect('/auth/login');
  const params = (await searchParams) ?? {};
  const page = await listNotificationsForUser(session.id, { page: params.page });
  const [unreadCount, preferences] = await Promise.all([
    getUnreadCount(session.id),
    getUserNotificationPrefs(session.id),
  ]);
  return (
    <NotificationsClient
      initialNotifications={page.items}
      initialUnreadCount={unreadCount}
      initialPage={page.page}
      initialTotalPages={page.totalPages}
      initialPreferences={
        preferences ?? {
          inApp: true,
          email: false,
          events: { enrollment: true, completion: true, certificate: true, application: true, announcement: true },
        }
      }
    />
  );
}
