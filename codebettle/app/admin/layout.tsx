import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getSession } from '@/lib/auth';
import { ADMIN_AREAS, areaForAdminPath, firstGrantedArea, hasAdminArea } from '@/lib/admin-access';
import { hasAdminCapability } from '@/lib/rbac';
import { isSuperAdmin } from '@/lib/super-admin';
import { canSeeAuditLog } from '@/components/audit/audit-helpers';
import PortalLayout from '@/components/layout/PortalLayout';
import { LayoutDashboard, BookOpen, Users, GraduationCap, ClipboardList, Tag, Bell, FileText, Newspaper, BarChart2, Award, Settings, UserCheck, Mail, Megaphone, MessageSquare, ShieldCheck, ScrollText, ListChecks, User } from 'lucide-react';

const NAV_ICONS = {
  dashboard: <LayoutDashboard className="w-5 h-5" />,
  courses: <BookOpen className="w-5 h-5" />,
  students: <Users className="w-5 h-5" />,
  instructors: <GraduationCap className="w-5 h-5" />,
  enrollments: <ClipboardList className="w-5 h-5" />,
  coupons: <Tag className="w-5 h-5" />,
  announcements: <Bell className="w-5 h-5" />,
  messages: <Mail className="w-5 h-5" />,
  requests: <MessageSquare className="w-5 h-5" />,
  notifications: <Bell className="w-5 h-5" />,
  communications: <Megaphone className="w-5 h-5" />,
  blog: <Newspaper className="w-5 h-5" />,
  content: <FileText className="w-5 h-5" />,
  reports: <BarChart2 className="w-5 h-5" />,
  certificates: <Award className="w-5 h-5" />,
  applications: <UserCheck className="w-5 h-5" />,
  // Phase 6 — Forms Builder sidebar icon.
  forms: <ListChecks className="w-5 h-5" />,
  settings: <Settings className="w-5 h-5" />,
} as const;

/**
 * Admin layout — role gate + per-area enforcement (Item G).
 *
 * The session carries the user's adminPermissions, read fresh from the
 * user record on every request (lib/auth.ts), so a change in
 * /admin/access applies on the target's very next request.
 *
 * - Sidebar: only the areas the admin was granted are shown. Full admins
 *   (no restriction) see everything, plus "Admin Access" when they are
 *   authorized administrators. The "Audit Log" item is shown after
 *   "Reports" to authorized administrators and to admins granted audit
 *   viewing (session.canViewAuditLog) — it is not an ADMIN_AREAS entry,
 *   because it is not grantable through /admin/access.
 * - Page guard: the requested path comes from the `x-pathname` header
 *   set in proxy.ts. A restricted admin opening an area they were not
 *   granted is redirected to the first area they do have (or home when
 *   they have none). /admin/access is restricted to authorized
 *   administrators (isSuperAdmin), not merely full admins, and
 *   /admin/audit* requires admin capability AND (authorized
 *   administrator OR canViewAuditLog). This is the server-side
 *   enforcement — hiding nav items alone would not be.
 *   When the header is absent (prefetch), the redirect is skipped;
 *   dynamic admin pages are never prefetched, and the API routes have
 *   their own per-area guards (lib/api-helpers requireAdminArea).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // Phase 2, Module 21.4: while an admin is viewing a teacher's
  // portal (view-as), the admin panel is unreachable — the session
  // is the teacher's until they return via the banner. Send them
  // back to the portal they are viewing instead of the login page.
  if (session?.viewAs) redirect('/instructor/dashboard');
  // Phase 2: admin capability is the isAdmin flag (legacy primary role 'admin' still counts).
  if (!session || !hasAdminCapability(session)) redirect('/auth/login');

  const permissions = session.adminPermissions;
  // Phase 5, Module 23: audit access — authorized administrators, plus
  // admins explicitly granted audit viewing (canViewAuditLog, carried on
  // the session by Worker A). The audit nav item and guard below use
  // the same rule as the audit page itself.
  const authorizedAdmin = isSuperAdmin(session);
  const canViewAuditLog = session.canViewAuditLog === true;
  const showAuditNav = canSeeAuditLog({ isAuthorizedAdmin: authorizedAdmin, canViewAuditLog });

  const navItems = ADMIN_AREAS.filter((area) => hasAdminArea(permissions, area.key)).map(
    (area) => ({ href: area.href, label: area.label, icon: NAV_ICONS[area.key] }),
  );
  // Profile is not a grantable ADMIN_AREAS entry (every admin-capability
  // user has a profile) — it sits at the end of the built list, next to
  // Settings, like the Profile item in the other portals' sidebars.
  navItems.push({
    href: '/admin/profile',
    label: 'Profile',
    icon: <User className="w-5 h-5" />,
  });
  if (showAuditNav) {
    const auditItem = {
      href: '/admin/audit',
      label: 'Audit Log',
      icon: <ScrollText className="w-5 h-5" />,
    };
    const reportsIdx = navItems.findIndex((item) => item.href === '/admin/reports');
    if (reportsIdx >= 0) navItems.splice(reportsIdx + 1, 0, auditItem);
    else navItems.push(auditItem);
  }
  if (authorizedAdmin) {
    navItems.push({
      href: '/admin/access',
      label: 'Admin Access',
      icon: <ShieldCheck className="w-5 h-5" />,
    });
  }

  const pathname = (await headers()).get('x-pathname') ?? '';
  if (pathname) {
    const area = areaForAdminPath(pathname);
    if (area === 'access') {
      // /admin/access is authorized-administrator only — a full admin
      // who is not one of them is redirected, same as any denied area.
      if (!authorizedAdmin) redirect(firstGrantedArea(permissions)?.href ?? '/');
    } else if (pathname === '/admin/audit' || pathname.startsWith('/admin/audit/')) {
      if (!showAuditNav) redirect(firstGrantedArea(permissions)?.href ?? '/');
    } else if (area !== null) {
      if (!hasAdminArea(permissions, area)) {
        redirect(firstGrantedArea(permissions)?.href ?? '/');
      }
    } else if (pathname === '/admin' || pathname === '/admin/') {
      // /admin has no page of its own — send them to their first area.
      redirect(firstGrantedArea(permissions)?.href ?? '/');
    }
    // Unknown /admin/* paths are left alone to 404.
  }

  return (
    <PortalLayout user={session} navItems={navItems} portalName="Admin Panel">
      {children}
    </PortalLayout>
  );
}
