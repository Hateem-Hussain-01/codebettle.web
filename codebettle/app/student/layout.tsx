import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { getSession } from '@/lib/auth';
import { parseSidebarCollapsed, SIDEBAR_COLLAPSED_COOKIE } from '@/lib/sidebar';
import { hasTeacherCapability } from '@/lib/rbac';
import { getAdminBasePath } from '@/lib/admin-url';
import { countUnsubmittedVisibleAssignments } from '@/lib/db/assignments';
import { getAmbassadorByUserId } from '@/lib/db/ambassadors';
import PortalLayout from '@/components/layout/PortalLayout';
import ViewAsBanner from '@/components/layout/ViewAsBanner';
import TeacherMessagePopup from '@/components/notifications/TeacherMessagePopup';
import { LayoutDashboard, BookOpen, Compass, Award, StickyNote, Heart, Star, Bell, User, FileQuestion, LifeBuoy, ClipboardList, Users } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/student/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  // Explore New Courses (Eman, 15 Nov 2026): a student who finished
  // their courses had no way to enrol in another one without leaving
  // for the landing page. This sits directly above My Courses and
  // lists every published course in the portal.
  { href: '/student/explore', label: 'Explore New Courses', icon: <Compass className="w-5 h-5" /> },
  { href: '/student/courses', label: 'My Courses', icon: <BookOpen className="w-5 h-5" /> },
  { href: '/student/quizzes', label: 'Quizzes', icon: <FileQuestion className="w-5 h-5" /> },
  { href: '/student/assignments', label: 'Assignments', icon: <ClipboardList className="w-5 h-5" /> },
  { href: '/student/certificates', label: 'Certificates', icon: <Award className="w-5 h-5" /> },
  { href: '/student/notes', label: 'My Notes', icon: <StickyNote className="w-5 h-5" /> },
  { href: '/student/wishlist', label: 'Wishlist', icon: <Heart className="w-5 h-5" /> },
  { href: '/student/reviews', label: 'My Reviews', icon: <Star className="w-5 h-5" /> },
  { href: '/student/requests', label: 'Support', icon: <LifeBuoy className="w-5 h-5" /> },
  { href: '/student/notifications', label: 'Notifications', icon: <Bell className="w-5 h-5" /> },
  { href: '/student/profile', label: 'Profile', icon: <User className="w-5 h-5" /> },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // Collapsed sidebar (Eman, 18 Nov 2026): read the persisted
  // preference from the cookie so the rail renders collapsed on the
  // first paint — no flash or width jump.
  const defaultCollapsed = parseSidebarCollapsed((await cookies()).get(SIDEBAR_COLLAPSED_COOKIE)?.value);
  // Phase 2, Module 21.4 — view-as scope (extended 16 Nov 2026):
  // teacher view-as NEVER opens a student portal — a viewing admin
  // who navigates here by hand goes back to the teacher portal they
  // are viewing. Ambassador view-as opens EXACTLY ONE student route,
  // /student/ambassador; every other /student/* route bounces back
  // to the ambassador dashboard (never to /instructor/dashboard —
  // there is no teacher portal in an ambassador viewing session).
  // The path comes from the `x-pathname` header the proxy sets —
  // the same seam as the admin layout's per-area guard. A missing
  // header means "cannot tell" (RSC prefetch skips the proxy) — the
  // real navigation re-checks with the header set, so allow it,
  // exactly like the admin layout does.
  const isAmbassadorViewAs = session?.viewAs?.kind === 'ambassador';
  if (session?.viewAs && !isAmbassadorViewAs) redirect('/instructor/dashboard');
  if (isAmbassadorViewAs) {
    const pathname = (await headers()).get('x-pathname');
    if (pathname !== null && pathname !== '/student/ambassador') redirect('/student/ambassador');
  }
  // Phase 2, verified from code (not assumed): the student portal still
  // requires the PRIMARY role 'student' — NOT "any authenticated user".
  // A teacher or admin cannot open /student/*; if a multi-role user
  // needs the student portal, their primary role must be 'student'
  // (a known limitation, flagged in the Phase 2 foundation report).
  //
  // ONE exception — the Ambassador Dashboard (Eman, 16 Nov 2026,
  // dashboard switcher): the page lives under /student/*, so a
  // teacher+ambassador whose PRIMARY role is instructor would be
  // bounced by the rule above and the instructor portal's Ambassador
  // nav item would lead nowhere. The requested path arrives via the
  // `x-pathname` header (proxy.ts, same pattern as the admin layout);
  // only /student/ambassador is exempt, and only for teacher-capable
  // users — the page itself still requires an active ambassador row.
  // Every other /student/* page keeps the primary-role rule, and a
  // missing header (prefetch) falls back to the strict rule.
  const pathname = (await headers()).get('x-pathname') ?? '';
  const isAmbassadorPage = pathname === '/student/ambassador';
  if (!session || (session.role !== 'student' && !(isAmbassadorPage && hasTeacherCapability(session)))) {
    redirect('/auth/login');
  }

  // Assignments notification bubble (Eman, 15 Nov 2026): the count of
  // the student's VISIBLE assignments they have not submitted yet — a
  // new assignment raises it, submitting one lowers it. Computed here
  // server-side, so the sidebar shows it on first paint; it refreshes
  // when the layout re-renders (full page load / entering the portal),
  // not on every SPA navigation inside the portal and not in
  // realtime. Fail-safe: if the count query throws, the layout
  // renders WITHOUT a badge — a badge must never break the sidebar.
  let assignmentBadge: number | undefined;
  try {
    const unsubmitted = await countUnsubmittedVisibleAssignments(session.id);
    if (unsubmitted > 0) assignmentBadge = unsubmitted;
  } catch {
    assignmentBadge = undefined;
  }
  const navItems =
    assignmentBadge === undefined
      ? NAV_ITEMS
      : NAV_ITEMS.map((item) =>
          item.href === '/student/assignments' ? { ...item, badge: assignmentBadge } : item,
        );

  // Ambassador Dashboard (Eman, 16 Nov 2026): the "Ambassador" nav
  // item shows ONLY for approved ambassadors (active Ambassador row
  // linked to this student) — everyone else never sees it. Fail-safe:
  // if the lookup throws, the layout renders WITHOUT the item — a
  // missing referral table must never break the sidebar.
  let showAmbassadorNav = false;
  try {
    const ambassador = await getAmbassadorByUserId(session.id);
    showAmbassadorNav = ambassador !== null && ambassador.status === 'active';
  } catch {
    showAmbassadorNav = false;
  }
  const finalNavItems = showAmbassadorNav
    ? [...navItems, { href: '/student/ambassador', label: 'Ambassador', icon: <Users className="w-5 h-5" /> }]
    : navItems;

  // Ambassador view-as shows ONLY the Ambassador nav item: the
  // viewing scope is the dashboard alone, and the other items would
  // only bounce back here. Real students keep the full nav.
  const navItemsForRender = isAmbassadorViewAs
    ? finalNavItems.filter((item) => item.href === '/student/ambassador')
    : finalNavItems;

  return (
    <>
      {/* Ambassador view-as banner (same Exit as the teacher portal,
          returning to /admin/ambassadors instead of
          /admin/instructors). */}
      {session?.viewAs?.kind === 'ambassador' && (
        <ViewAsBanner
          adminName={session.viewAs.adminName}
          adminBasePath={getAdminBasePath()}
          returnPath="ambassadors"
          viewedPortal="ambassador's"
        />
      )}
      {/* Theme toggle lives in Profile settings for students (Eman,
          15 Nov 2026) — the top-bar toggle is hidden in this portal
          only; instructor/admin portals keep theirs. */}
      <PortalLayout user={session} navItems={navItemsForRender} portalName="Student Portal" adminBasePath={getAdminBasePath()} hideThemeToggle defaultCollapsed={defaultCollapsed}>
        {children}
      </PortalLayout>
      {/* Phase 3, Worker C: "Message from Your Teacher" popup. It shows
          only the teacher messages Worker B's shared LoginNotificationPopup
          (mounted in PortalLayout) does NOT show — see
          TeacherMessagePopup's header comment for the dedup rule. */}
      <TeacherMessagePopup />
    </>
  );
}
