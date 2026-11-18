import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { parseSidebarCollapsed, SIDEBAR_COLLAPSED_COOKIE } from '@/lib/sidebar';
import { hasTeacherCapability } from '@/lib/rbac';
import { getAdminBasePath } from '@/lib/admin-url';
import { hasTeamAccess } from '@/lib/db/team';
import { getAmbassadorByUserId } from '@/lib/db/ambassadors';
import PortalLayout from '@/components/layout/PortalLayout';
import ViewAsBanner from '@/components/layout/ViewAsBanner';
import { LayoutDashboard, BookOpen, Users, Bell, Star, FolderOpen, User, BarChart2, FileQuestion, ClipboardList } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/instructor/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { href: '/instructor/courses', label: 'My Courses', icon: <BookOpen className="w-5 h-5" /> },
  { href: '/instructor/quizzes', label: 'Quizzes', icon: <FileQuestion className="w-5 h-5" /> },
  { href: '/instructor/assignments', label: 'Assignments', icon: <ClipboardList className="w-5 h-5" /> },
  { href: '/instructor/students', label: 'Students', icon: <Users className="w-5 h-5" /> },
  { href: '/instructor/announcements', label: 'Announcements', icon: <Bell className="w-5 h-5" /> },
  { href: '/instructor/notifications', label: 'Notifications', icon: <Bell className="w-5 h-5" /> },
  { href: '/instructor/reports', label: 'Reports', icon: <BarChart2 className="w-5 h-5" /> },
  { href: '/instructor/reviews', label: 'Reviews', icon: <Star className="w-5 h-5" /> },
  { href: '/instructor/resources', label: 'Resources', icon: <FolderOpen className="w-5 h-5" /> },
  { href: '/instructor/profile', label: 'Profile', icon: <User className="w-5 h-5" /> },
];

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // Collapsed sidebar (Eman, 18 Nov 2026): read the persisted
  // preference from the cookie so the rail renders collapsed on the
  // first paint — no flash or width jump.
  const defaultCollapsed = parseSidebarCollapsed((await cookies()).get(SIDEBAR_COLLAPSED_COOKIE)?.value);
  // Phase 2: teacher capability is the isTeacher flag (legacy primary
  // role 'instructor' still counts). A PURE admin (isAdmin only, no
  // teacher flag) is still redirected — unchanged from before; admins
  // use the admin portal and the quiz APIs that already allow admins,
  // not the instructor portal. An admin WITH the teacher flag passes
  // here and uses the teacher portal.
  if (!session || !hasTeacherCapability(session)) redirect('/auth/login');

  // Team Portal switcher (Eman, 16 Nov 2026): a teacher who also
  // holds team access gets "Switch to Team Portal" in the topbar.
  // Fail-safe: a missing team table reads as no access.
  let hasTeam = false;
  try {
    hasTeam = await hasTeamAccess(session);
  } catch {
    hasTeam = false;
  }

  // Ambassador Dashboard (Eman, 16 Nov 2026 — dashboard switcher):
  // the same check as the student layout — the "Ambassador" nav item
  // shows ONLY for approved ambassadors (active Ambassador row linked
  // to this teacher) and points at /student/ambassador, which admits
  // teacher-capable sessions. Fail-safe: if the lookup throws, the
  // layout renders WITHOUT the item — a missing referral table must
  // never break the sidebar.
  let showAmbassadorNav = false;
  try {
    const ambassador = await getAmbassadorByUserId(session.id);
    showAmbassadorNav = ambassador !== null && ambassador.status === 'active';
  } catch {
    showAmbassadorNav = false;
  }
  const navItems = showAmbassadorNav
    ? [...NAV_ITEMS, { href: '/student/ambassador', label: 'Ambassador', icon: <Users className="w-5 h-5" /> }]
    : NAV_ITEMS;

  return (
    <>
      {/* Phase 2, Module 21.4: while an admin views this portal, show
          the banner (who is viewing + the way back). The session user
          is the teacher; session.viewAs names the viewing admin. */}
      {session.viewAs && <ViewAsBanner adminName={session.viewAs.adminName} adminBasePath={getAdminBasePath()} />}
      <PortalLayout user={session} navItems={navItems} portalName="Instructor Portal" adminBasePath={getAdminBasePath()} hasTeamAccess={hasTeam} defaultCollapsed={defaultCollapsed}>
        {children}
      </PortalLayout>
    </>
  );
}
