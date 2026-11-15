import { connection } from 'next/server';
import Link from 'next/link';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { BadgeCheck, MailCheck, XCircle } from 'lucide-react';
import { confirmEmailChange } from '@/lib/services/email-verification-service';

/**
 * Confirm email change page (Security Phase 3, CRITICAL-A2).
 * /auth/confirm-email-change?token=<raw>&email=<new address> — the
 * link from the email-change confirmation email, sent to the NEW
 * address only. Consuming the token applies the pending email change
 * and revokes ALL of the user's sessions (they must sign in again
 * with the new address). The token is single-use and expires after
 * 24 hours; it is bound to the new address, so it cannot confirm a
 * change to a different address. This mirrors
 * /auth/verify-email (same GET-consumes-token server-component
 * pattern). `await connection()` opts out of build-time prerendering
 * — the token is only known at request time, and confirming it writes
 * to the DB.
 */
export default async function ConfirmEmailChangePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  await connection();
  const { token, email } = await searchParams;
  const result =
    token && email
      ? await confirmEmailChange(token, email)
      : { error: 'No confirmation link was provided' };
  const confirmed = 'success' in result;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pt-16">
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-16">
          <div className="text-center mb-8">
            <MailCheck className="w-12 h-12 text-primary-text mx-auto mb-3" />
            <h1 className="text-3xl font-black text-foreground">Confirm your new email</h1>
            <p className="text-muted mt-2 text-sm">
              Confirming your new CodeBettle email address.
            </p>
          </div>

          {confirmed ? (
            <Card className="border-primary/30">
              <div className="flex items-center gap-2 mb-3">
                <BadgeCheck className="w-6 h-6 text-green-400" />
                <h2 className="text-foreground font-bold">Your email has been changed</h2>
              </div>
              <p className="text-muted text-sm">
                Your CodeBettle email address is now{' '}
                <span className="text-foreground font-semibold">{result.email}</span>. All of
                your sessions were signed out for security — please sign in again with your new
                email address.
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
                  : 'This confirmation link is invalid or has expired.'}{' '}
                Confirmation links expire after 24 hours and can only be used once. Ask an admin
                to request the email change again, or sign in with your current email address.
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
