import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { hasTeacherCapability } from '@/lib/rbac';
import PortalLayout from '@/components/layout/PortalLayout';
import { LayoutDashboard, BookOpen, Users, Bell, Star, FolderOpen, User, BarChart2, FileQuestion } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/instructor/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { href: '/instructor/courses', label: 'My Courses', icon: <BookOpen className="w-5 h-5" /> },
  { href: '/instructor/quizzes', label: 'Quizzes', icon: <FileQuestion className="w-5 h-5" /> },
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
  // Phase 2: teacher capability is the isTeacher flag (legacy primary
  // role 'instructor' still counts). A PURE admin (isAdmin only, no
  // teacher flag) is still redirected — unchanged from before; admins
  // use the admin portal and the quiz APIs that already allow admins,
  // not the instructor portal. An admin WITH the teacher flag passes
  // here and uses the teacher portal.
  if (!session || !hasTeacherCapability(session)) redirect('/auth/login');

  return (
    <PortalLayout user={session} navItems={NAV_ITEMS} portalName="Instructor Portal">
      {children}
    </PortalLayout>
  );
}
