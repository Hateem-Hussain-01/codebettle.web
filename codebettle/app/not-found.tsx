import Link from 'next/link';
import FadeIn from '@/components/ui/FadeIn';

/**
 * Custom 404 page (Phase 7, CSP). The built-in 404 is prerendered
 * static, so its scripts get no nonce and the nonce CSP would block
 * them. Forcing dynamic rendering keeps the page working under CSP.
 */
export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center">
      <FadeIn className="flex flex-col items-center">
      <h1 className="text-6xl font-black text-foreground">404</h1>
      <p className="text-muted mt-3">This page does not exist.</p>
      <Link href="/" className="text-primary-text font-medium mt-6 hover:underline">
        Back to home
      </Link>
      </FadeIn>
    </main>
  );
}
