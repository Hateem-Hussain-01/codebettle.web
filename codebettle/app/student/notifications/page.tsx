import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getUnreadCount, listNotificationsForUser } from '@/lib/db/notifications';
import { getUserNotificationPrefs } from '@/lib/db/users';
import StudentNotificationsClient from './student-notifications-client';

/**
 * Student notifications — server wrapper (Phase 4).
 * Fetches the signed-in student's real notifications (newest first,
 * paginated) plus their unread count and preferences on the server.
 */
export default async function StudentNotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  await connection();
  const session = await getSession();
  if (!session || session.role !== 'student') redirect('/auth/login');
  const params = (await searchParams) ?? {};
  const page = await listNotificationsForUser(session.id, { page: params.page });
  const [unreadCount, preferences] = await Promise.all([
    getUnreadCount(session.id),
    getUserNotificationPrefs(session.id),
  ]);
  return (
    <StudentNotificationsClient
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
