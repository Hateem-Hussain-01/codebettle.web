import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { hasTeacherCapability } from '@/lib/rbac';
import PortalLayout from '@/components/layout/PortalLayout';
import { LayoutDashboard, FileText, PlusCircle, User } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/applicant/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { href: '/applicant/application', label: 'My Applications', icon: <FileText className="w-5 h-5" /> },
  { href: '/applicant/new', label: 'New Application', icon: <PlusCircle className="w-5 h-5" /> },
  { href: '/applicant/profile', label: 'My Profile', icon: <User className="w-5 h-5" /> },
];

/**
 * Applicant portal layout (Phase 2, Modules 19/20).
 *
 * Guard: any signed-in user may enter — being an applicant means
 * having an InstructorApplication with userId = their id, and the
 * portal is also how a first application is filed, so the layout
 * does not require an application to exist. The APIs enforce
 * ownership per application; pages show the "no application yet"
 * state with a link to /applicant/new when the list is empty.
 *
 * No teacher features live here (no courses, recordings or
 * announcements). Once onboarded, a user holds the teacher flag and
 * is sent to the normal Teacher Portal instead — application history
 * then lives under Teacher Portal → My Profile.
 */
export default async function ApplicantLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/auth/login');
  if (hasTeacherCapability(session)) redirect('/instructor/dashboard');

  return (
    <PortalLayout user={session} navItems={NAV_ITEMS} portalName="Applicant Portal">
      {children}
    </PortalLayout>
  );
}
