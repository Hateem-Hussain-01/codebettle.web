import Link from 'next/link';
import { Wrench } from 'lucide-react';

/**
 * Maintenance page (Settings fix).
 *
 * Shown when the admin turns maintenance mode on — the proxy rewrites
 * every public path here (see proxy.ts). Deliberately static: no DB
 * read, no settings fetch, no Navbar/Footer, so it renders even when
 * the database is down or the settings migration has not run yet.
 */
export default function MaintenancePage() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center bg-dark-card border border-dark-border rounded-xl p-10">
        <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary-text flex items-center justify-center mx-auto mb-6">
          <Wrench className="w-7 h-7" />
        </div>
        <p className="text-2xl font-black gradient-text mb-2">CodeBettle</p>
        <h1 className="text-2xl font-bold text-foreground mb-3">We&apos;ll be back soon</h1>
        <p className="text-muted text-sm leading-relaxed mb-8">
          The site is under maintenance right now. Please check back in a little while — we&apos;ll be back up shortly.
        </p>
        <Link
          href="/auth/login"
          className="inline-block text-sm font-semibold text-primary-text hover:underline"
        >
          Admin login →
        </Link>
      </div>
    </main>
  );
}
