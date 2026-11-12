'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, LogOut, Bell, ChevronRight, ArrowLeftRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { getPortalSwitch, portalFromPathname } from '@/lib/portal-switch';
import { portalMenuLinks } from '@/lib/user-menu';
import UserMenu from '@/components/layout/UserMenu';
import LoginNotificationPopup from '@/components/notifications/LoginNotificationPopup';
import NotificationBadge from '@/components/notifications/NotificationBadge';
import ThemeToggle from '@/components/theme/ThemeToggle';
import type { SessionUser } from '@/lib/auth';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface PortalLayoutProps {
  user: SessionUser;
  navItems: NavItem[];
  children: React.ReactNode;
  portalName: string;
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
 * Sidebar navigation (module-level, Phase 7 fix CB-15).
 * It used to be defined INSIDE PortalLayout, so React saw a new
 * component type on every render and remounted the whole sidebar —
 * losing focus/scroll state on every navigation. Hoisted out with its
 * data as props, it keeps its identity across renders.
 */
function Sidebar({
  user,
  navItems,
  pathname,
  portalName,
  mobile = false,
  onClose,
}: {
  user: SessionUser;
  navItems: NavItem[];
  pathname: string;
  portalName: string;
  mobile?: boolean;
  onClose: () => void;
}) {
  return (
    <div className={cn('flex flex-col h-full', mobile ? 'p-4' : '')}>
      {/* Logo */}
      <div className="px-4 py-5 border-b border-dark-border flex items-center justify-between">
        <Link href="/" className="text-xl font-black gradient-text">CodeBettle</Link>
        {mobile && (
          <button onClick={onClose} aria-label="Close menu" className="text-muted hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* User info */}
      <div className="px-4 py-4 border-b border-dark-border">
        <div className="flex items-center gap-3">
          <img src={user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${user.name}`} alt={user.name} className="w-9 h-9 rounded-full object-cover border-2 border-primary/40" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
            <p className="text-xs text-muted capitalize">{portalName}</p>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(item => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => mobile && onClose()}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                isActive ? 'bg-primary/10 text-primary-text border border-primary/20' : 'text-muted hover:text-foreground hover:bg-dark-border'
              )}
            >
              <span className={cn('w-5 h-5 flex-shrink-0', isActive ? 'text-primary-text' : 'text-muted group-hover:text-foreground')}>{item.icon}</span>
              {item.label}
              {isActive && <ChevronRight className="w-4 h-4 ml-auto text-primary-text" />}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-dark-border">
        <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:text-red-400 hover:bg-red-500/10 transition-all w-full cursor-pointer">
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

export default function PortalLayout({ user, navItems, children, portalName }: PortalLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Module 17 — dual-role portal switching. The switch link is plain
  // navigation to the other portal's dashboard: the target portal's
  // server layout guard (capability flags) is the enforcement point,
  // and the session cookie is untouched, so switching never logs the
  // user out. getPortalSwitch returns null unless the user holds the
  // OTHER portal's capability — a normal teacher/admin/student sees
  // no switch option at all.
  const switchTarget = getPortalSwitch(user, pathname);
  // Bell/avatar stay in the CURRENT portal, not the user's primary
  // role: a teacher+admin whose primary role is 'instructor' but who
  // switched into the admin panel must get /admin/notifications, not
  // /instructor/notifications. Falls back to the primary role outside
  // any portal (should not happen — this layout only renders inside
  // a portal — but keeps the old behaviour rather than a broken link).
  const portalSlug = portalFromPathname(pathname) ?? user.role;
  // Avatar menu destinations come from the CURRENT portal prefix in
  // the pathname (see lib/user-menu.ts) — portalFromPathname does not
  // know /applicant, so the menu must not reuse portalSlug here. The
  // bell above keeps using portalSlug on purpose (no
  // /applicant/notifications page exists).
  const links = portalMenuLinks(pathname, user.role);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Phase 3 (Worker B) — login notification popup. Mounted here so
          it runs after login in every portal (student / instructor /
          admin) and never on public/auth pages. It fetches its own
          pending notifications and renders nothing on failure. */}
      <LoginNotificationPopup />
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-dark-card border-r border-dark-border flex-shrink-0">
        <Sidebar user={user} navItems={navItems} pathname={pathname} portalName={portalName} onClose={() => setSidebarOpen(false)} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {/* Theme audit: dark scrim over the page behind the mobile sidebar — stays dark in both themes. */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', damping: 30 }} className="fixed left-0 top-0 h-full w-72 bg-dark-card border-r border-dark-border z-50 lg:hidden">
              <Sidebar user={user} navItems={navItems} pathname={pathname} portalName={portalName} mobile onClose={() => setSidebarOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 flex items-center justify-between px-4 sm:px-6 border-b border-dark-border bg-dark-card/50 backdrop-blur-sm flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="lg:hidden text-muted hover:text-foreground p-1 rounded cursor-pointer">
            <Menu className="w-5 h-5" />
          </button>
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
            {/* Module 6 — light/dark theme toggle (cookie preference). */}
            <ThemeToggle />
            {/* The bell used to be a dead button (no action at all). It is
                now a link to the portal notifications page, with a real
                unread-count badge (Phase 3, NotificationBadge — the fetch
                lives in that component so this layout keeps only its
                logout fetch). The badge is display-only: nothing here
                enforces access — the notifications page and its API
                enforce ownership server-side. */}
            <Link href={`/${portalSlug}/notifications`} aria-label="Notifications" className="relative text-muted hover:text-foreground transition-colors p-2 rounded-lg hover:bg-dark-border cursor-pointer">
              <Bell className="w-5 h-5" />
              <NotificationBadge />
            </Link>
            <UserMenu user={user} profileHref={links.profileHref} settingsHref={links.settingsHref} onLogout={handleLogout} />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
