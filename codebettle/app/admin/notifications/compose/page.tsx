import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { hasAdminCapability } from '@/lib/rbac';
import { firstGrantedArea, hasAdminArea } from '@/lib/admin-access';
import { listCourses } from '@/lib/db/courses';
import FadeIn from '@/components/ui/FadeIn';
import AdminNotificationComposeForm from '@/components/notifications/AdminNotificationComposeForm';

/**
 * Admin compose notification — server wrapper (Phase 3, Worker B).
 *
 * Server-side guard (defence in depth — the admin layout already
 * redirects non-admins and restricted admins, and areaForAdminPath maps
 * /admin/notifications/compose to the `notifications` area):
 * - no session or no admin capability -> /auth/login
 * - admin without the `notifications` area -> first granted area
 * The POST /api/admin/notifications endpoint enforces the same gate
 * again — hiding this page alone would never be the enforcement.
 */
export default async function AdminComposeNotificationPage() {
  const session = await getSession();
  if (!session || !hasAdminCapability(session)) redirect('/auth/login');
  if (!hasAdminArea(session.adminPermissions, 'notifications')) {
    const first = firstGrantedArea(session.adminPermissions);
    redirect(first ? first.href : '/');
  }
  const coursesPage = await listCourses({ limit: '100' });

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-foreground">Compose Notification</h1>
        <p className="text-muted text-sm mt-1">
          Send an in-app notification to all users, a role, one user, or a course&apos;s enrolled students.
        </p>
      </FadeIn>
      <AdminNotificationComposeForm courses={coursesPage.items} />
    </div>
  );
}
