import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getAdminBasePath } from '@/lib/admin-url';
import { hasTeamAccess, isTeamTableReady } from '@/lib/db/team';
import PortalLayout from '@/components/layout/PortalLayout';
import Link from 'next/link';
import { LayoutDashboard, ClipboardList, Megaphone, CalendarCheck, FolderOpen, Bell } from 'lucide-react';

/**
 * Team Portal — hidden by design (Eman, 16 Nov 2026). No link to
 * /team exists in the navbar, footer, or sitemap; these pages carry
 * noindex as well, so Google never lists them even if the URL is
 * discovered. Access is enforced by role on the server: an
 * unauthorized visitor is redirected to login, never shown content.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const NAV_ITEMS = [
  { href: '/team/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { href: '/team/tasks', label: 'Tasks', icon: <ClipboardList className="w-5 h-5" /> },
  { href: '/team/announcements', label: 'Announcements', icon: <Megaphone className="w-5 h-5" /> },
  { href: '/team/meetings', label: 'Meetings', icon: <CalendarCheck className="w-5 h-5" /> },
  { href: '/team/files', label: 'Files', icon: <FolderOpen className="w-5 h-5" /> },
  { href: '/team/notifications', label: 'Notifications', icon: <Bell className="w-5 h-5" /> },
];

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/auth/login');
  // While an admin views a teacher's portal (view-as), the team portal
  // is unreachable — send them back to the portal they are viewing.
  if (session.viewAs) redirect('/instructor/dashboard');

  // Fail-safe: until Eman runs codebettle-team-portal-migration.sql,
  // the team tables do not exist. Show a friendly "not set up yet"
  // page — never a 500, never a redirect loop to login for a signed-in
  // user whose access simply cannot be checked yet.
  let ready = false;
  try {
    ready = await isTeamTableReady();
  } catch {
    ready = false;
  }
  if (!ready) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center border border-dark-border bg-dark-card rounded-xl p-8">
          <h1 className="text-xl font-black text-foreground">Team Portal is not set up yet</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            The team portal tables have not been created yet. An admin needs to run the team portal SQL file in the
            Supabase SQL Editor first — after that, this page will open automatically.
          </p>
          <Link href="/" className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-bold text-ink">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  // Team access is a separate grant (TeamAccess row, by linked userId
  // or by email) — admins do NOT pass by virtue of being admins.
  let allowed = false;
  try {
    allowed = await hasTeamAccess(session);
  } catch {
    allowed = false;
  }
  if (!allowed) redirect('/auth/login');

  return (
    <PortalLayout user={session} navItems={NAV_ITEMS} portalName="Team Portal" adminBasePath={getAdminBasePath()} hasTeamAccess>
      {children}
    </PortalLayout>
  );
}
