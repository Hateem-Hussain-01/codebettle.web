import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { MotionConfig } from 'framer-motion';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { SiteSettingsProvider } from '@/components/layout/Footer';
import { THEME_COOKIE, THEME_SCRIPT, parseThemeCookie } from '@/lib/theme';
import { getSiteSettings } from '@/lib/services/settings-service';

/**
 * Settings fix: metadata comes from the admin-managed site settings
 * (site name + description). getSiteSettings() NEVER throws — on any
 * DB error (table missing before the migration runs, DB unreachable)
 * it returns the defaults, so with no rows saved this renders
 * byte-identical to the old static metadata. The layout is already
 * dynamically rendered (cookies()/headers() below), so
 * generateMetadata runs per request at runtime, not at build time;
 * and importing the service opens no DB connection at build time
 * (the client is lazy — see lib/db/client.ts), so the build stays
 * green with no database present.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return {
    metadataBase: new URL('https://codebettle-web.vercel.app'),
    title: `${settings.siteName} — Learn to Code, Build Your Future`,
    description: settings.siteDescription,
    keywords: ['coding courses', 'programming', 'web development', 'Pakistan', 'online learning'],
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Module 6 — theme. A returning visitor's saved cookie sets
  // data-theme server-side (no flash at all); a first-time visitor
  // gets no attribute here and the pre-hydration script below sets it
  // from the device/OS preference before the first paint. Either way
  // suppressHydrationWarning is needed: the script may add the
  // attribute between the server render and hydration.
  // Reading cookies()/headers() opts the layout into dynamic rendering
  // — every page route is already dynamic via the proxy (nonce CSP).
  const theme = parseThemeCookie((await cookies()).get(THEME_COOKIE)?.value);
  // Settings fix: the admin-managed site settings are read once here
  // (server-side, never throws — defaults on any DB error) and handed
  // to every page through SiteSettingsProvider, so client components
  // such as the Footer and the contact page can show them without
  // touching the database themselves (see Footer.tsx).
  const settings = await getSiteSettings();
  // x-nonce is set by proxy.ts (one fresh nonce per request, the same
  // one in the CSP header). Without it the inline theme script would
  // be blocked by the nonce CSP (Phase 7, SEC-09). If the header is
  // missing (e.g. a render outside the proxy), the script renders
  // without a nonce rather than breaking the page.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en" className="h-full" data-theme={theme ?? undefined} suppressHydrationWarning>
      <body className="min-h-full antialiased bg-background text-foreground" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
        {/*
          Module 6 — pre-hydration theme script. First child of <body>
          so it runs before any content paints: reads the cb-theme
          cookie, else the device preference, and sets data-theme on
          <html>. Carries the request nonce (see above).
        */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <ThemeProvider>
          {/*
            Phase 6: framer-motion respects the user's reduced-motion
            preference (transform/layout animations off when preferred).
            CSS animations are handled by the media query in globals.css.
          */}
          <MotionConfig reducedMotion="user"><SiteSettingsProvider settings={settings}>{children}</SiteSettingsProvider></MotionConfig>
        </ThemeProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            // Theme-aware via the same tokens as the rest of the UI
            // (was hardcoded dark #1C1C1C/#fff/#2A2A2A).
            style: { background: 'var(--color-dark-card)', color: 'var(--color-foreground)', border: '1px solid var(--color-dark-border)' },
            success: { iconTheme: { primary: '#F5C518', secondary: '#111' } },
          }}
        />
      </body>
    </html>
  );
}
