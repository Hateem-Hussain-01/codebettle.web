'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { Menu, X, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '@/components/ui/Button';
import ThemeToggle from '@/components/theme/ThemeToggle';
import BackButton from '@/components/layout/BackButton';
import { useNavConfig } from '@/components/layout/NavConfigProvider';
import { resolveNavbarInitialItems } from '@/lib/nav-config-client';
import { primaryPortalDashboard } from '@/lib/portal-switch';
import { portalMenuLinks } from '@/lib/user-menu';
import UserMenu from '@/components/layout/UserMenu';

interface NavbarProps {
  // email is optional so existing callers keep compiling; when present
  // the avatar menu header shows it under the user's name.
  session?: { name: string; role: string; avatar?: string; email?: string } | null;
  /**
   * Navbar config from the Navbar Editor (PR #32). The root layout
   * fetches it server-side and provides it through NavConfigProvider,
   * so the navbar renders the SAVED items on its first paint (no
   * fetch flash). When a caller passes navItems explicitly those win
   * and no fetch happens. When neither is available, the navbar
   * fetches GET /api/nav on mount — and until it answers it renders
   * a skeleton, NEVER the hardcoded defaults (15 Nov 2026 flash fix:
   * the defaults include 'Instructors', so showing them while loading
   * flashed a deleted item on every SPA navigation). The defaults are
   * used only when the server says there is genuinely no saved config
   * (fromDefaults) or the fetch fails with nothing else to show.
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
  // Server-provided config from the root layout (null when rendered
  // outside the layout). The first paint uses it when present — the
  // saved items, never the hardcoded fallback (see
  // resolveNavbarInitialItems).
  const serverConfig = useNavConfig();
  const [navItems, setNavItems] = useState(() => resolveNavbarInitialItems(navItemsProp, serverConfig));
  const [logoUrl, setLogoUrl] = useState(logoUrlProp ?? serverConfig?.logoUrl ?? DEFAULT_LOGO_URL);
  const [logoFailed, setLogoFailed] = useState(false);
  // True once the navbar has real items to show (a prop, the server
  // config, or a resolved fetch). While false the desktop links area
  // renders a skeleton — never the fallback items.
  const [navReady, setNavReady] = useState(Boolean(navItemsProp || serverConfig));

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Navbar Editor config (PR #32), revalidation (15 Nov 2026 flash
  // fix): an explicit navItems prop is authoritative and needs no
  // fetch. Otherwise the navbar revalidates against GET /api/nav in
  // the background on every mount — the first paint already showed
  // the server-provided items, so this only swaps in NEWER saved
  // truth (e.g. an item the admin deleted after the page loaded).
  // The response is the resolved server truth: DB rows when a config
  // is saved, the hardcoded defaults only when the table is empty
  // (fromDefaults) — so swapping to it can never flash a deleted
  // item. No-store: a cached response could resurrect a just-deleted
  // item. On fetch failure the current items stay; the hardcoded
  // fallback is used only when there was never anything else to show
  // (no prop, no server config), so the nav never breaks.
  useEffect(() => {
    if (navItemsProp) return;
    let cancelled = false;
    fetch('/api/nav', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (Array.isArray(data.items)) setNavItems(data.items);
        // A logoUrl passed as a prop stays authoritative; the fetch
        // only supplies the logo when no prop was given.
        if (typeof data.logoUrl === 'string' && data.logoUrl && !logoUrlProp) setLogoUrl(data.logoUrl);
        setNavReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        if (!serverConfig) setNavItems(FALLBACK_NAV_ITEMS);
        setNavReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [navItemsProp, logoUrlProp, serverConfig]);

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

          {/* Desktop Nav — while the config is still loading (no prop,
              no server config, fetch pending) a skeleton renders here,
              never the hardcoded fallback items: a deleted item must
              not appear, not even briefly. */}
          <div className="hidden md:flex items-center gap-6">
            {!navReady ? (
              <div className="flex items-center gap-6" aria-hidden="true">
                {[56, 76, 40, 64, 48, 58].map((w, i) => (
                  <span key={i} className="h-4 rounded bg-dark-border animate-pulse" style={{ width: w }} />
                ))}
              </div>
            ) : (
              navItems.map((item) => (
                <Link key={item.href} href={item.href} className="text-sm text-muted hover:text-foreground transition-colors">
                  {item.label}
                </Link>
              ))
            )}
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
