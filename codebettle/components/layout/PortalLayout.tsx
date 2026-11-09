'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, LogOut, Bell, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
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
  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
    window.location.href = '/';
  };

  return (
    <div className={cn('flex flex-col h-full', mobile ? 'p-4' : '')}>
      {/* Logo */}
      <div className="px-4 py-5 border-b border-dark-border flex items-center justify-between">
        <Link href="/" className="text-xl font-black gradient-text">CodeBettle</Link>
        {mobile && (
          <button onClick={onClose} aria-label="Close menu" className="text-muted hover:text-white">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* User info */}
      <div className="px-4 py-4 border-b border-dark-border">
        <div className="flex items-center gap-3">
          <img src={user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${user.name}`} alt={user.name} className="w-9 h-9 rounded-full object-cover border-2 border-primary/40" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{user.name}</p>
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
                isActive ? 'bg-primary/10 text-primary border border-primary/20' : 'text-muted hover:text-white hover:bg-dark-border'
              )}
            >
              <span className={cn('w-5 h-5 flex-shrink-0', isActive ? 'text-primary' : 'text-muted group-hover:text-white')}>{item.icon}</span>
              {item.label}
              {isActive && <ChevronRight className="w-4 h-4 ml-auto text-primary" />}
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

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-dark-card border-r border-dark-border flex-shrink-0">
        <Sidebar user={user} navItems={navItems} pathname={pathname} portalName={portalName} onClose={() => setSidebarOpen(false)} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
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
          <button onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="lg:hidden text-muted hover:text-white p-1 rounded cursor-pointer">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1 lg:flex-none" />
          <div className="flex items-center gap-3">
            {/* The bell used to be a dead button (no action at all). It is
                now a link to the portal notifications page. */}
            <Link href={`/${user.role}/notifications`} aria-label="Notifications" className="relative text-muted hover:text-white transition-colors p-2 rounded-lg hover:bg-dark-border cursor-pointer">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
            </Link>
            <Link href={`/${user.role}/profile`}>
              <img src={user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${user.name}`} alt={user.name} className="w-8 h-8 rounded-full object-cover border-2 border-primary/40 cursor-pointer hover:border-primary transition-colors" />
            </Link>
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
