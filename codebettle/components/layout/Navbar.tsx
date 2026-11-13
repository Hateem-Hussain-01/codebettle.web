'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { Menu, X, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '@/components/ui/Button';
import ThemeToggle from '@/components/theme/ThemeToggle';
import { primaryPortalDashboard } from '@/lib/portal-switch';
import { portalMenuLinks } from '@/lib/user-menu';
import UserMenu from '@/components/layout/UserMenu';

interface NavbarProps {
  // email is optional so existing callers keep compiling; when present
  // the avatar menu header shows it under the user's name.
  session?: { name: string; role: string; avatar?: string; email?: string } | null;
}

export default function Navbar({ session }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Module 17: the public navbar points at the user's PRIMARY portal
  // (role is the primary role). A dual-role user lands on their home
  // portal here and uses the in-portal switcher to reach the other one.
  const portalLink = primaryPortalDashboard(session);

  // Avatar menu destinations, role-based: the navbar sits on public
  // pages, so there is no portal prefix in the pathname to derive
  // from (portalMenuLinks(null, ...) falls back to the primary role).
  const menuLinks = session ? portalMenuLinks(null, session.role) : null;

  // Same logout as the portal topbar (POST /api/auth logout, then
  // home). No new API — the endpoint already handles the action.
  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
    window.location.href = '/';
  };

  return (
    <nav className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${scrolled ? 'bg-dark/95 backdrop-blur-md border-b border-dark-border shadow-lg' : 'bg-transparent'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="CodeBettle" width={36} height={36} className="rounded-lg" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <span className="text-xl font-bold gradient-text">CodeBettle</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-6">
            <Link href="/courses" className="text-sm text-muted hover:text-foreground transition-colors">Courses</Link>
            <Link href="/instructors" className="text-sm text-muted hover:text-foreground transition-colors">Instructors</Link>
            <Link href="/blog" className="text-sm text-muted hover:text-foreground transition-colors">Blog</Link>
            <Link href="/success-stories" className="text-sm text-muted hover:text-foreground transition-colors">Success Stories</Link>
            <Link href="/about" className="text-sm text-muted hover:text-foreground transition-colors">About</Link>
            <Link href="/contact" className="text-sm text-muted hover:text-foreground transition-colors">Contact</Link>
          </div>

          {/* Auth */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />
            {session && menuLinks ? (
              <UserMenu
                user={{ name: session.name, email: session.email, avatar: session.avatar }}
                profileHref={menuLinks.profileHref}
                settingsHref={menuLinks.settingsHref}
                onLogout={handleLogout}
              />
            ) : (
              <>
                <Link href="/auth/login"><Button variant="ghost" size="sm">Login</Button></Link>
                <Link href="/auth/register"><Button variant="primary" size="sm">Get Started</Button></Link>
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <div className="flex items-center gap-1 md:hidden">
            <ThemeToggle />
            <button onClick={() => setMobileOpen(!mobileOpen)} className="text-muted hover:text-foreground transition-colors p-2" aria-label={mobileOpen ? 'Close menu' : 'Open menu'}>
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-dark-card border-b border-dark-border"
          >
            <div className="px-4 py-4 flex flex-col gap-3">
              {[['/', 'Home'], ['/courses', 'Courses'], ['/instructors', 'Instructors'], ['/blog', 'Blog'], ['/success-stories', 'Success Stories'], ['/about', 'About'], ['/contact', 'Contact']].map(([href, label]) => (
                <Link key={href} href={href} className="text-muted hover:text-foreground py-1.5 text-sm" onClick={() => setMobileOpen(false)}>{label}</Link>
              ))}
              <div className="pt-2 border-t border-dark-border flex flex-col gap-2">
                {session ? (
                  <Link href={portalLink!} onClick={() => setMobileOpen(false)}>
                    <Button variant="primary" size="sm" fullWidth>Go to Portal</Button>
                  </Link>
                ) : (
                  <>
                    <Link href="/auth/login" onClick={() => setMobileOpen(false)}><Button variant="secondary" size="sm" fullWidth>Login</Button></Link>
                    <Link href="/auth/register" onClick={() => setMobileOpen(false)}><Button variant="primary" size="sm" fullWidth>Get Started</Button></Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
