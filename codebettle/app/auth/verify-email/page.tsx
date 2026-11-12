import { connection } from 'next/server';
import Link from 'next/link';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { BadgeCheck, MailCheck, XCircle } from 'lucide-react';
import { verifyEmail } from '@/lib/services/email-verification-service';

/**
 * Email verification page (auth UX upgrade).
 * /auth/verify-email?token=... — the link from the signup verification
 * email. Consumes the token and marks the account verified. This is a
 * SEPARATE page from /verify/[token], the public certificate
 * verification page — the two token namespaces never collide.
 * `await connection()` opts out of build-time prerendering (the token
 * is only known at request time, and verifying it writes to the DB).
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  await connection();
  const { token } = await searchParams;
  const result = token ? await verifyEmail(token) : { error: 'No verification token was provided' };
  const verified = 'success' in result;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pt-16">
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-16">
          <div className="text-center mb-8">
            <MailCheck className="w-12 h-12 text-primary-text mx-auto mb-3" />
            <h1 className="text-3xl font-black text-foreground">Verify your email</h1>
            <p className="text-muted mt-2 text-sm">
              Confirming your CodeBettle email address.
            </p>
          </div>

          {verified ? (
            <Card className="border-primary/30">
              <div className="flex items-center gap-2 mb-3">
                <BadgeCheck className="w-6 h-6 text-green-400" />
                <h2 className="text-foreground font-bold">Your email is verified</h2>
              </div>
              <p className="text-muted text-sm">
                Thanks — your email address is confirmed and your account is
                ready. You can now sign in and start learning.
              </p>
              <div className="mt-5">
                <Link href="/auth/login">
                  <Button>Sign in</Button>
                </Link>
              </div>
            </Card>
          ) : (
            <Card className="border-red-500/30">
              <div className="flex items-center gap-2 mb-3">
                <XCircle className="w-6 h-6 text-red-400" />
                <h2 className="text-foreground font-bold">This link didn&apos;t work</h2>
              </div>
              <p className="text-muted text-sm">
                {'error' in result
                  ? result.error
                  : 'This verification link is invalid or has expired.'}{' '}
                Verification links expire after 24 hours and can only be used
                once. Sign in and request a new verification email, or create
                a new account.
              </p>
              <div className="mt-5">
                <Link href="/auth/login">
                  <Button>Go to sign in</Button>
                </Link>
              </div>
            </Card>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
