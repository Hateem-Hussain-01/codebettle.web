import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import PortalLayout from '@/components/layout/PortalLayout';
import { LayoutDashboard, BookOpen, Users, GraduationCap, ClipboardList, Tag, Bell, FileText, Newspaper, BarChart2, Award, Settings, UserCheck } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { href: '/admin/courses', label: 'Courses', icon: <BookOpen className="w-5 h-5" /> },
  { href: '/admin/students', label: 'Students', icon: <Users className="w-5 h-5" /> },
  { href: '/admin/instructors', label: 'Instructors', icon: <GraduationCap className="w-5 h-5" /> },
  { href: '/admin/enrollments', label: 'Enrollments', icon: <ClipboardList className="w-5 h-5" /> },
  { href: '/admin/coupons', label: 'Coupon Codes', icon: <Tag className="w-5 h-5" /> },
  { href: '/admin/announcements', label: 'Announcements', icon: <Bell className="w-5 h-5" /> },
  { href: '/admin/notifications', label: 'Notifications', icon: <Bell className="w-5 h-5" /> },
  { href: '/admin/blog', label: 'Blog', icon: <Newspaper className="w-5 h-5" /> },
  { href: '/admin/content', label: 'Content', icon: <FileText className="w-5 h-5" /> },
  { href: '/admin/reports', label: 'Reports', icon: <BarChart2 className="w-5 h-5" /> },
  { href: '/admin/certificates', label: 'Certificates', icon: <Award className="w-5 h-5" /> },
  { href: '/admin/applications', label: 'Applications', icon: <UserCheck className="w-5 h-5" /> },
  { href: '/admin/settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/auth/login');

  return (
    <PortalLayout user={session} navItems={NAV_ITEMS} portalName="Admin Panel">
      {children}
    </PortalLayout>
  );
}
