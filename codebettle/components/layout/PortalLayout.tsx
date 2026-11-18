'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Bell, ArrowLeftRight } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { getPortalSwitch, portalFromPathname } from '@/lib/portal-switch';
import { portalMenuLinks } from '@/lib/user-menu';
import { sidebarCollapsedCookieString } from '@/lib/sidebar';
import CollapsibleSidebar from '@/components/layout/CollapsibleSidebar';
import type { NavItem } from '@/components/layout/CollapsibleSidebar';
import UserMenu from '@/components/layout/UserMenu';
import BackButton from '@/components/layout/BackButton';
import LoginNotificationPopup from '@/components/notifications/LoginNotificationPopup';
import NotificationBadge from '@/components/notifications/NotificationBadge';
import ThemeToggle from '@/components/theme/ThemeToggle';
import { AdminBasePathProvider } from '@/components/admin/AdminBasePathContext';
import type { SessionUser } from '@/lib/auth';

export type { NavItem } from '@/components/layout/CollapsibleSidebar';

interface PortalLayoutProps {
  user: SessionUser;
  navItems: NavItem[];
  children: React.ReactNode;
  portalName: string;
  /**
   * Admin base path (PR #33) — the secret admin URL's first segment,
   * read from ADMIN_BASE_PATH by the server layout and passed down.
   * The portal layout hands it to the portal-switch / menu helpers
   * (which build admin links) and to the AdminBasePathProvider, so
   * admin client components can build links without ever touching
   * process.env. Dev default 'admin'. Only the admin portal's links
   * use it; the other portals just pass it through.
   */
  adminBasePath?: string;
  /**
   * Team Portal access (Eman, 16 Nov 2026): the server layout passes
   * true when the user holds ACTIVE team access, so the topbar
   * switcher can offer the team portal. Defaults to false — portals
   * that do not check it (or check fail-safe) simply never offer the
   * switch. UI only: the team layout guard is the enforcement.
   */
  hasTeamAccess?: boolean;
  /**
   * Hide the top-bar theme toggle (Eman, 15 Nov 2026): students change
   * the theme from Profile settings instead. Defaults to false — the
   * instructor and admin portals keep their top-bar toggle.
   */
  hideThemeToggle?: boolean;
  /**
   * Initial collapsed state of the desktop sidebar (Eman, 18 Nov
   * 2026): read from the cb-sidebar-collapsed cookie by the server
   * layout, so a user who prefers the collapsed rail never sees a
   * first-paint flash or width jump. Defaults to false (expanded).
   */
  defaultCollapsed?: boolean;
}

/**
 * Shared logout (module-level, profile avatar menu). The sidebar's
 * Sign Out button and the topbar UserMenu both use this one function —
 * POST logout, then back to the public home page. Hoisted out of
 * Sidebar for the same reason Sidebar itself was hoisted (Phase 7
 * fix CB-15): a function defined inside a component is a new identity
 * on every render, and the topbar needs the same logout.
 */
async function handleLogout() {
  await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
  window.location.href = '/';
}

/**
 * Sidebar navigation lives in components/layout/CollapsibleSidebar.tsx
 * (Eman, 18 Nov 2026 — premium animated collapsible sidebar): one
 * shared client component for every portal. It stays a module-level
 * component imported here (Phase 7 fix CB-15) — never inline it in
 * PortalLayout or it remounts on every render and loses focus/scroll
 * state. The four server layouts pass their own permission-filtered
 * navItems; this layout only forwards them.
 */

export default function PortalLayout({ user, navItems, children, portalName, adminBasePath = 'admin', hasTeamAccess = false, hideThemeToggle = false, defaultCollapsed = false }: PortalLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Collapsed rail state (Eman, 18 Nov 2026): seeded from the cookie
  // the server layout read, so there is no first-paint flash for
  // users who prefer the collapsed rail. The toggle writes the cookie
  // back (lib/sidebar.ts) so the choice persists across navigation
  // and reloads. The sidebar component sequences its label fade
  // around this flip; this state only owns the width.
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const reduceMotion = useReducedMotion();
  const pathname = usePathname();

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      document.cookie = sidebarCollapsedCookieString(next);
      return next;
    });
  };

  // Module 17 — dual-role portal switching. The switch link is plain
  // navigation to the other portal's dashboard: the target portal's
  // server layout guard (capability flags) is the enforcement point,
  // and the session cookie is untouched, so switching never logs the
  // user out. getPortalSwitch returns null unless the user holds the
  // OTHER portal's capability — a normal teacher/admin/student sees
  // no switch option at all.
  const switchTarget = getPortalSwitch(user, pathname, adminBasePath, hasTeamAccess);
  // Bell/avatar stay in the CURRENT portal, not the user's primary
  // role: a teacher+admin whose primary role is 'instructor' but who
  // switched into the admin panel must get /admin/notifications, not
  // /instructor/notifications. Falls back to the primary role outside
  // any portal (should not happen — this layout only renders inside
  // a portal — but keeps the old behaviour rather than a broken link).
  const portalSlug = portalFromPathname(pathname, adminBasePath) ?? user.role;
  // The bell's URL prefix for the current portal. The admin portal's
  // prefix is the secret base path (PR #33), not '/admin'.
  const portalBase = portalSlug === 'admin' ? `/${adminBasePath}` : `/${portalSlug}`;
  // Avatar menu destinations come from the CURRENT portal prefix in
  // the pathname (see lib/user-menu.ts) — portalFromPathname does not
  // know /applicant, so the menu must not reuse portalSlug here. The
  // bell above keeps using portalSlug on purpose (no
  // /applicant/notifications page exists).
  const links = portalMenuLinks(pathname, user.role, adminBasePath);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Phase 3 (Worker B) — login notification popup. Mounted here so
          it runs after login in every portal (student / instructor /
          admin) and never on public/auth pages. It fetches its own
          pending notifications and renders nothing on failure. */}
      <LoginNotificationPopup />
      {/* Desktop Sidebar — subtle glass (Eman, 18 Nov 2026): the
          dark-card surface at 85% + backdrop blur, so the content
          area's edge reads through faintly without hurting
          readability. Width animates 256px ↔ 80px over 0.45s ease-out
          (FadeIn's house timing — Eman, 18 Nov 2026 motion
          correction: slow, elegant, damped, not the video's fast
          expo glide); the flex content area follows it. */}
      <aside
        className={cn(
          'hidden shrink-0 flex-col overflow-hidden border-r border-dark-border bg-dark-card/85 shadow-[0_8px_30px_rgba(0,0,0,0.15)] backdrop-blur-xl lg:flex',
          collapsed ? 'w-20' : 'w-64',
          !reduceMotion && 'transition-[width] duration-450 ease-out',
        )}
      >
        <CollapsibleSidebar user={user} navItems={navItems} pathname={pathname} portalName={portalName} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} onLogout={handleLogout} onClose={() => setSidebarOpen(false)} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {/* Theme audit: dark scrim over the page behind the mobile sidebar — stays dark in both themes. */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={reduceMotion ? { duration: 0 } : { type: 'spring', damping: 30 }} className="fixed left-0 top-0 h-full w-72 bg-dark-card/90 border-r border-dark-border backdrop-blur-xl z-50 lg:hidden">
              <CollapsibleSidebar user={user} navItems={navItems} pathname={pathname} portalName={portalName} collapsed={false} onToggleCollapsed={toggleCollapsed} onLogout={handleLogout} mobile onClose={() => setSidebarOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar — relative z-20 so the ThemeToggle / UserMenu dropdowns
            (absolute, z-50 inside this header's stacking context) paint
            ABOVE the <main> content below. Without it the header's
            backdrop-blur stacking context (z-auto) paints in DOM order
            and <main> — which comes after it — covers the open menu. */}
        <header className="relative z-20 h-14 flex items-center justify-between px-4 sm:px-6 border-b border-dark-border bg-dark-card/50 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-2">
            {/* Back button (PR #33, alignment fix 14 Nov 2026): in-flow
                in the header, left side, next to the mobile menu
                button. It used to be a fixed chip at top-[4.5rem]
                floating over the content — 72px, right where the
                page heading starts (header h-14 + content p-4/p-6),
                so it covered every portal page's title. In the
                header it is always visible, never overlaps a heading,
                and works on every portal page (admin / student /
                instructor). */}
            <BackButton inline />
            <button onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="lg:hidden text-muted hover:text-foreground p-1 rounded cursor-pointer">
              <Menu className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 lg:flex-none" />
          <div className="flex items-center gap-3">
            {/* Module 17 — portal switcher. Rendered only when the user
                holds the other portal's capability (see getPortalSwitch);
                otherwise nothing renders here at all. A plain <Link>:
                no session change, no client-sent role, no extra request
                — the target portal's layout guard decides access. */}
            {switchTarget && (
              <Link
                href={switchTarget.href}
                aria-label={switchTarget.label}
                title={switchTarget.label}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-medium text-muted hover:text-foreground hover:bg-dark-border border border-dark-border hover:border-primary/40 transition-colors cursor-pointer"
              >
                <ArrowLeftRight className="w-4 h-4 text-primary-text" />
                <span className="hidden sm:inline">{switchTarget.label}</span>
              </Link>
            )}
            {/* Module 6 — light/dark theme toggle (cookie preference).
                Hidden in portals that moved it into Profile settings
                (student portal, Eman 15 Nov 2026); the Navbar keeps its
                own toggle for public pages / logged-out visitors. */}
            {!hideThemeToggle && <ThemeToggle />}
            {/* The bell used to be a dead button (no action at all). It is
                now a link to the portal notifications page, with a real
                unread-count badge (Phase 3, NotificationBadge — the fetch
                lives in that component so this layout keeps only its
                logout fetch). The badge is display-only: nothing here
                enforces access — the notifications page and its API
                enforce ownership server-side. */}
            <Link href={`${portalBase}/notifications`} aria-label="Notifications" className="relative text-muted hover:text-foreground transition-colors p-2 rounded-lg hover:bg-dark-border cursor-pointer">
              <Bell className="w-5 h-5" />
              <NotificationBadge />
            </Link>
            <UserMenu user={user} profileHref={links.profileHref} settingsHref={links.settingsHref} onLogout={handleLogout} />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6">
            {/* Admin base path (PR #33): admin client components build
                their links from this context, never from process.env. */}
            <AdminBasePathProvider value={adminBasePath}>{children}</AdminBasePathProvider>
          </div>
        </main>
      </div>
    </div>
  );
}
