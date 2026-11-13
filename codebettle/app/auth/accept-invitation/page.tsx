'use client';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle2, Lock, Eye, EyeOff, Mail, ShieldAlert, Download } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import toast from 'react-hot-toast';

/**
 * Accept an admin invitation (Phase 2, Module 18).
 *
 * The link in the invitation email points here with ?token=…. The page
 * first previews the token (GET /api/auth/accept-invitation): a valid
 * token prefills the invitee's email (read-only) and shows the
 * set-your-own-password form; an invalid, expired or already-used
 * token shows a clear error page with no password form.
 *
 * On accept (POST /api/auth/accept-invitation) the invitee's own
 * password is set, the stored grants are applied, and the token is
 * consumed. Success shows a message, then redirects to /auth/login
 * to sign in — no session is created here.
 */
function AcceptInvitationForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';
  const [preview, setPreview] = useState<{ email: string; firstName: string; lastName: string } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  // Secret admin sign-in URL (PR #33), returned by the accept API —
  // the invitee signs in there, not at the public /auth/login.
  const [portalUrl, setPortalUrl] = useState('');

  useEffect(() => {
    if (!token) {
      setPreviewError('This invitation link is missing its token.');
      setLoadingPreview(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/auth/accept-invitation?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setPreviewError(data.error ?? 'This invitation link is invalid or has expired');
          return;
        }
        setPreview(data);
      } catch {
        if (!cancelled) setPreviewError('Could not check this invitation link. Please try again.');
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!accepted || !portalUrl) return;
    const timer = setTimeout(() => router.push(portalUrl), 3000);
    return () => clearTimeout(timer);
  }, [accepted, portalUrl, router]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/accept-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'This invitation link is invalid or has expired'); return; }
      if (typeof data.portalUrl === 'string') setPortalUrl(data.portalUrl);
      setAccepted(true);
      toast.success('Your account is ready!');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-dark-card border border-dark-border rounded-2xl p-8">
      <div className="text-center mb-8">
        <Link href="/" className="text-2xl font-black gradient-text">CodeBettle</Link>
        <h1 className="text-xl font-bold text-foreground mt-4">
          {accepted ? 'Welcome to CodeBettle!' : 'Accept your invitation'}
        </h1>
        <p className="text-muted text-sm mt-1">
          {accepted
            ? 'Your admin account is ready.'
            : 'Set your own password to activate your admin account.'}
        </p>
      </div>

      {loadingPreview && <p className="text-muted text-sm text-center">Checking your invitation…</p>}

      {!loadingPreview && !accepted && previewError && (
        <div className="text-center">
          <ShieldAlert className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-lg font-bold text-foreground mt-4">This invitation link doesn&apos;t work</h2>
          <p className="text-muted text-sm mt-2">{previewError}</p>
          <p className="text-muted text-sm mt-2">
            Invitation links expire after 7 days and can only be used once.
            Ask an admin to send you a fresh invitation.
          </p>
          <Link href="/auth/login">
            <Button fullWidth size="lg" className="mt-6">Back to Sign In</Button>
          </Link>
        </div>
      )}

      {!loadingPreview && !accepted && preview && (
        <form onSubmit={handleAccept} className="space-y-4">
          <Input
            label="Email Address"
            type="email"
            value={preview.email}
            icon={<Mail className="w-4 h-4" />}
            readOnly
            disabled
          />
          <p className="text-muted text-xs -mt-2">
            Invited as {preview.firstName} {preview.lastName}. Your password is yours alone — nobody at CodeBettle sets it for you.
          </p>
          <div className="relative">
            <Input
              label="Choose a Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              icon={<Lock className="w-4 h-4" />}
              required
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-8 text-muted hover:text-foreground cursor-pointer">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <Input
            label="Confirm Password"
            type="password"
            placeholder="Repeat your new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            icon={<Lock className="w-4 h-4" />}
            required
          />
          <Button type="submit" fullWidth size="lg" loading={submitting}>Set Password &amp; Join</Button>
        </form>
      )}

      {accepted && (
        <div className="text-center">
          <CheckCircle2 className="w-12 h-12 text-primary-text mx-auto" />
          <h2 className="text-lg font-bold text-foreground mt-4">Your account is ready!</h2>
          <p className="text-muted text-sm mt-2">
            Your password is set and your admin access is active.
            Taking you to sign in…
          </p>
          {portalUrl && (
            <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-left">
              <p className="text-sm font-semibold text-foreground">Your admin sign-in link</p>
              <p className="text-xs text-muted mt-1">
                This is a private link — it is not on the public website and cannot be found by searching. Save it now.
              </p>
              <p className="text-xs text-primary-text mt-2 break-all">{portalUrl}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  const text = `CodeBettle admin sign-in link\n${portalUrl}\n\nSave this link — you cannot find it by searching.\n`;
                  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'codebettle-admin-link.txt';
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                  toast.success('Admin link downloaded');
                }}
              >
                <Download className="w-4 h-4" /> Download the link (.txt)
              </Button>
            </div>
          )}
          <Link href={portalUrl || '/auth/login'}>
            <Button fullWidth size="lg" className="mt-6">Sign In Now</Button>
          </Link>
        </div>
      )}

      {!accepted && (
        <p className="text-center text-sm text-muted mt-6">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-primary-text hover:underline font-medium">Back to Sign In</Link>
        </p>
      )}
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-16">
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-[100px]" />
      </div>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
        <Suspense fallback={<div className="text-muted text-center">Loading...</div>}>
          <AcceptInvitationForm />
        </Suspense>
      </motion.div>
    </div>
  );
}
