import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { MotionConfig } from 'framer-motion';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { THEME_COOKIE, THEME_SCRIPT, parseThemeCookie } from '@/lib/theme';

export const metadata: Metadata = {
  metadataBase: new URL('https://codebettle-web.vercel.app'),
  title: 'CodeBettle — Learn to Code, Build Your Future',
  description: 'CodeBettle is a premier digital institute offering expert-led courses in web development, mobile development, data science, UI/UX design, and more.',
  keywords: ['coding courses', 'programming', 'web development', 'Pakistan', 'online learning'],
};

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
          <MotionConfig reducedMotion="user">{children}</MotionConfig>
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
