import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { MotionConfig } from 'framer-motion';

export const metadata: Metadata = {
  metadataBase: new URL('https://codebettle-web.vercel.app'),
  title: 'CodeBettle — Learn to Code, Build Your Future',
  description: 'CodeBettle is a premier digital institute offering expert-led courses in web development, mobile development, data science, UI/UX design, and more.',
  keywords: ['coding courses', 'programming', 'web development', 'Pakistan', 'online learning'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full antialiased bg-background text-foreground" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
        {/*
          Phase 6: framer-motion respects the user's reduced-motion
          preference (transform/layout animations off when preferred).
          CSS animations are handled by the media query in globals.css.
        */}
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: '#1C1C1C', color: '#fff', border: '1px solid #2A2A2A' },
            success: { iconTheme: { primary: '#F5C518', secondary: '#111' } },
          }}
        />
      </body>
    </html>
  );
}
