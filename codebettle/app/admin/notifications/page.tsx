import { connection } from 'next/server';
import Link from 'next/link';
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
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
        <Link
          href="/admin/notifications/compose"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-ink hover:bg-primary-dark active:scale-95"
        >
          Compose notification
        </Link>
      </div>
      <NotificationsClient
      initialNotifications={page.items}
      initialUnreadCount={unreadCount}
      initialPage={page.page}
      initialTotalPages={page.totalPages}
      initialPreferences={
        preferences ?? {
          inApp: true,
          email: false,
          events: { enrollment: true, completion: true, certificate: true, application: true, announcement: true, support_request: true, request_update: true, form_submission: true },
        }
      }
      />
    </div>
  );
}
