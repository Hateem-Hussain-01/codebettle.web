import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { getAmbassadorByUserId } from '@/lib/db/ambassadors';
import AuthShell from '@/components/auth/AuthShell';
import LoginForm from '@/components/auth/LoginForm';
import RegisterForm from '@/components/auth/RegisterForm';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Users } from 'lucide-react';

export const metadata = {
  title: 'Login as Ambassador | CodeBettle',
  description:
    'Ambassadors sign in here to open their Ambassador Dashboard — referral link, team, and meeting link.',
};

/**
 * Ambassador login (Eman, 16 Nov 2026) — a real, linked, indexable
 * page so "Login as Ambassador" can be found: footer link + a link
 * on /become-ambassador + this page in the sitemap.
 *
 * - Logged in + approved ambassador → straight to the dashboard.
 * - Logged in but not an ambassador → a friendly message + apply link.
 * - Logged out → the existing login form (same AuthShell as
 *   /auth/login); after sign-in the `?redirect=` param sends them to
 *   /student/ambassador.
 *
 * Honest note: Google chooses sitelinks itself — this page being
 * real, linked and indexable only makes it ELIGIBLE. Sitelinks can
 * appear only after codebettle.com goes live and Google indexes it.
 */
export default async function AmbassadorLoginPage() {
  const session = await getSession();
  if (session) {
    const ambassador = await getAmbassadorByUserId(session.id);
    if (ambassador && ambassador.status === 'active') {
      redirect('/student/ambassador');
    }
    return (
      <>
        <Navbar session={session} />
        <main className="min-h-screen bg-background pt-16">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <Card className="py-16 text-center">
              <Users className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-foreground font-medium">You are signed in, but not an ambassador yet</p>
              <p className="text-muted text-sm mt-1">
                This sign-in is for approved ambassadors. Apply below and the team will review your application.
              </p>
              <Link href="/become-ambassador" className="inline-block mt-4">
                <Button>Become our Ambassador</Button>
              </Link>
            </Card>
          </div>
        </main>
        <Footer />
      </>
    );
  }
  // The ambassador link is hidden here on purpose: this IS the
  // ambassador login page, so the link would point at itself
  // (LoginForm's showAmbassadorLink prop, default shown elsewhere).
  return <AuthShell initialMode="login" loginForm={<LoginForm showAmbassadorLink={false} />} registerForm={<RegisterForm />} />;
}
