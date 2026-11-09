import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import PortalLayout from '@/components/layout/PortalLayout';
import { LayoutDashboard, BookOpen, Users, Bell, Star, FolderOpen, User, BarChart2 } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/instructor/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { href: '/instructor/courses', label: 'My Courses', icon: <BookOpen className="w-5 h-5" /> },
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
  if (!session || session.role !== 'instructor') redirect('/auth/login');

  return (
    <PortalLayout user={session} navItems={NAV_ITEMS} portalName="Instructor Portal">
      {children}
    </PortalLayout>
  );
}
