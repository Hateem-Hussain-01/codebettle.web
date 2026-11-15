import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getAdminBasePath } from '@/lib/admin-url';
import { countUnsubmittedVisibleAssignments } from '@/lib/db/assignments';
import PortalLayout from '@/components/layout/PortalLayout';
import TeacherMessagePopup from '@/components/notifications/TeacherMessagePopup';
import { LayoutDashboard, BookOpen, Compass, Award, StickyNote, Heart, Star, Bell, User, FileQuestion, LifeBuoy, ClipboardList } from 'lucide-react';

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
  // Phase 2, Module 21.4: view-as never opens a student portal. A
  // viewing admin who navigates here by hand goes back to the teacher
  // portal they are viewing.
  if (session?.viewAs) redirect('/instructor/dashboard');
  // Phase 2, verified from code (not assumed): the student portal still
  // requires the PRIMARY role 'student' — NOT "any authenticated user".
  // A teacher or admin cannot open /student/*; if a multi-role user
  // needs the student portal, their primary role must be 'student'
  // (a known limitation, flagged in the Phase 2 foundation report).
  if (!session || session.role !== 'student') redirect('/auth/login');

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

  return (
    <>
      {/* Theme toggle lives in Profile settings for students (Eman,
          15 Nov 2026) — the top-bar toggle is hidden in this portal
          only; instructor/admin portals keep theirs. */}
      <PortalLayout user={session} navItems={navItems} portalName="Student Portal" adminBasePath={getAdminBasePath()} hideThemeToggle>
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
