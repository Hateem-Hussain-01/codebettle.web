'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { Menu, X, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '@/components/ui/Button';
import ThemeToggle from '@/components/theme/ThemeToggle';
import BackButton from '@/components/layout/BackButton';
import { primaryPortalDashboard } from '@/lib/portal-switch';
import { portalMenuLinks } from '@/lib/user-menu';
import UserMenu from '@/components/layout/UserMenu';

interface NavbarProps {
  // email is optional so existing callers keep compiling; when present
  // the avatar menu header shows it under the user's name.
  session?: { name: string; role: string; avatar?: string; email?: string } | null;
  /**
   * Navbar config from the Navbar Editor (PR #32). When a server
   * component passes these, the navbar renders them immediately (no
   * fetch flash). When omitted, the navbar fetches GET /api/nav on
   * mount and falls back to DEFAULT_NAV_ITEMS until it answers — the
   * nav never breaks when the DB has no config yet.
   */
  navItems?: { label: string; href: string }[];
  logoUrl?: string;
}

const FALLBACK_NAV_ITEMS = [
  { label: 'Courses', href: '/courses' },
  { label: 'Instructors', href: '/instructors' },
  { label: 'Blog', href: '/blog' },
  { label: 'Spotlight', href: '/success-stories' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

const DEFAULT_LOGO_URL =
  'https://phuzoxshzdfzjvephlhq.supabase.co/storage/v1/object/public/course-images/brand/navbar-logo.png';

export default function Navbar({ session, navItems: navItemsProp, logoUrl: logoUrlProp }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navItems, setNavItems] = useState(navItemsProp ?? FALLBACK_NAV_ITEMS);
  const [logoUrl, setLogoUrl] = useState(logoUrlProp ?? DEFAULT_LOGO_URL);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Navbar Editor config (PR #32): when the caller did not pass items,
  // fetch the stored config. The fallback above is already showing, so
  // a failed fetch changes nothing — the nav never breaks.
  useEffect(() => {
    if (navItemsProp || logoUrlProp) return;
    let cancelled = false;
    fetch('/api/nav')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (Array.isArray(data.items) && data.items.length > 0) setNavItems(data.items);
        if (typeof data.logoUrl === 'string' && data.logoUrl) setLogoUrl(data.logoUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [navItemsProp, logoUrlProp]);

  // Module 17: the public navbar points at the user's PRIMARY portal
  // (role is the primary role). A dual-role user lands on their home
  // portal here and uses the in-portal switcher to reach the other one.
  // Admins go through /api/portal (a server-side redirect, PR #33):
  // the admin dashboard lives at the SECRET base path, which the
  // browser must never know — the endpoint redirects server-side, so
  // no secret appears in the page or the JS bundle.
  const portalLink =
    session?.role === 'admin' ? '/api/portal?to=dashboard' : primaryPortalDashboard(session);

  // Avatar menu destinations, role-based: the navbar sits on public
  // pages, so there is no portal prefix in the pathname to derive
  // from (portalMenuLinks(null, ...) falls back to the primary role).
  // Admins go through /api/portal for the same reason as above.
  const menuLinks = session
    ? session.role === 'admin'
      ? { profileHref: '/api/portal?to=profile', settingsHref: '/api/portal?to=settings' }
      : portalMenuLinks(null, session.role)
    : null;

  // Same logout as the portal topbar (POST /api/auth logout, then
  // home). No new API — the endpoint already handles the action.
  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
    window.location.href = '/';
  };

  return (
    <>
    <nav className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${scrolled ? 'bg-dark/95 backdrop-blur-md border-b border-dark-border shadow-lg' : 'bg-transparent'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo — the horizontal CodeBettle logo (PR #32, Navbar
              Editor: the URL comes from the navbarLogoUrl setting).
              Display height ~36px; the file itself is 260x80 (@2x).
              If the image fails to load, the text wordmark shows. */}
          <Link href="/" className="flex items-center gap-2">
            {!logoFailed ? (
              <Image
                src={logoUrl}
                alt="CodeBettle"
                width={130}
                height={40}
                className="h-9 w-auto"
                onError={() => setLogoFailed(true)}
                priority
              />
            ) : (
              <span className="text-xl font-bold gradient-text">CodeBettle</span>
            )}
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="text-sm text-muted hover:text-foreground transition-colors">
                {item.label}
              </Link>
            ))}
          </div>

          {/* Auth */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />
            {session && menuLinks ? (
              <>
                {/* Back to Dashboard (Eman, 14 Nov 2026): a logged-in
                    user on the home page (or any public page) had no
                    visible way back to their dashboard — the avatar
                    menu has no Dashboard link. The href reuses the
                    existing portalLink: student/instructor dashboards
                    directly, admin via /api/portal (server-side
                    redirect, so the secret admin base path never
                    appears in the page or the JS bundle). */}
                <Link href={portalLink!}>
                  <Button variant="primary" size="sm">Back to Dashboard</Button>
                </Link>
                <UserMenu
                  user={{ name: session.name, email: session.email, avatar: session.avatar }}
                  profileHref={menuLinks.profileHref}
                  settingsHref={menuLinks.settingsHref}
                  onLogout={handleLogout}
                />
              </>
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
              {[{ label: 'Home', href: '/' }, ...navItems.filter((item) => item.href !== '/')].map((item) => (
                <Link key={item.href} href={item.href} className="text-muted hover:text-foreground py-1.5 text-sm" onClick={() => setMobileOpen(false)}>{item.label}</Link>
              ))}
              <div className="pt-2 border-t border-dark-border flex flex-col gap-2">
                {session ? (
                  <Link href={portalLink!} onClick={() => setMobileOpen(false)}>
                    <Button variant="primary" size="sm" fullWidth>Back to Dashboard</Button>
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
    {/* Back button (PR #33): fixed chip below the navbar, on every public page. Hidden on the home page itself. */}
    <BackButton />
    </>
  );
}
