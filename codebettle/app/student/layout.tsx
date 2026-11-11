import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import PortalLayout from '@/components/layout/PortalLayout';
import { LayoutDashboard, BookOpen, Award, StickyNote, Heart, Star, Bell, User, FileQuestion } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/student/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { href: '/student/courses', label: 'My Courses', icon: <BookOpen className="w-5 h-5" /> },
  { href: '/student/quizzes', label: 'Quizzes', icon: <FileQuestion className="w-5 h-5" /> },
  { href: '/student/certificates', label: 'Certificates', icon: <Award className="w-5 h-5" /> },
  { href: '/student/notes', label: 'My Notes', icon: <StickyNote className="w-5 h-5" /> },
  { href: '/student/wishlist', label: 'Wishlist', icon: <Heart className="w-5 h-5" /> },
  { href: '/student/reviews', label: 'My Reviews', icon: <Star className="w-5 h-5" /> },
  { href: '/student/notifications', label: 'Notifications', icon: <Bell className="w-5 h-5" /> },
  { href: '/student/profile', label: 'Profile', icon: <User className="w-5 h-5" /> },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // Phase 2, verified from code (not assumed): the student portal still
  // requires the PRIMARY role 'student' — NOT "any authenticated user".
  // A teacher or admin cannot open /student/*; if a multi-role user
  // needs the student portal, their primary role must be 'student'
  // (a known limitation, flagged in the Phase 2 foundation report).
  if (!session || session.role !== 'student') redirect('/auth/login');

  return (
    <PortalLayout user={session} navItems={NAV_ITEMS} portalName="Student Portal">
      {children}
    </PortalLayout>
  );
}
