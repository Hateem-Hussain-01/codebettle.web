'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, MailCheck, Phone, User } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { getSafeRedirect } from '@/lib/security';
import toast from 'react-hot-toast';

/**
 * Create Account form — the right half of the sliding auth card.
 * Fields, validation, API call and redirect are unchanged from the
 * original register page (posts to /api/auth with action 'register').
 *
 * Signup verification email (contract with the email item): when the
 * register response includes `verificationEmailSent: true`, the form is
 * replaced by a prominent "verification email sent — check your inbox"
 * state instead of redirecting, with buttons to Sign In or continue to
 * the dashboard. When the flag is false/absent, behaviour is unchanged
 * (toast + redirect to /student/dashboard).
 *
 * ?redirect= (Eman, 16 Nov 2026 — register-first apply): the
 * register-first flow sends logged-out visitors here with
 * ?redirect=/become-ambassador, and ambassadors register from
 * /ambassador/login?redirect=/student/ambassador. The redirect is
 * honoured (same getSafeRedirect guard as the login form) so the
 * user lands back where they came from instead of the dashboard;
 * the Sign In links below carry it too, so switching to sign-in
 * does not drop it.
 */
export default function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const signInHref =
    searchParams.get('redirect')
      ? `/auth/login?redirect=${encodeURIComponent(searchParams.get('redirect')!)}`
      : '/auth/login';
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '', referralCode: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [verificationSent, setVerificationSent] = useState(false);
  const [continueTarget, setContinueTarget] = useState('/student/dashboard');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.includes('@')) e.email = 'Valid email required';
    if (form.password.length < 8) e.password = 'Password must be at least 8 characters';
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    // Referral code (Eman, 20 Nov 2026): optional — but when typed
    // it must be a real code shape (6 chars, A–Z/2–9, no 0/O/1/I).
    // The server is authoritative (it checks the code exists and is
    // active); this only catches typos early. The alphabet lives in
    // lib/referral.ts (REFERRAL_CODE_ALPHABET) — this client file
    // cannot import it (that module imports node:crypto), so the
    // pattern is inlined here and must match it.
    const code = form.referralCode.trim().toUpperCase();
    if (code && !/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(code)) {
      e.referralCode = 'Referral codes are 6 characters (letters and numbers, no 0, O, 1 or I)';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          ...form,
          // Send the code normalised (trimmed + uppercase); an empty
          // box sends nothing (undefined is dropped by stringify).
          referralCode: form.referralCode.trim() ? form.referralCode.trim().toUpperCase() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      // Where to go after signup: an explicit ?redirect= (register-first
      // apply, or the ambassador login) wins; otherwise the dashboardUrl
      // from the register API (Team Portal, Eman 16 Nov 2026: a
      // pre-granted team member lands on the team portal); otherwise
      // the student dashboard.
      const fallback = typeof data.dashboardUrl === 'string' ? data.dashboardUrl : '/student/dashboard';
      const target = getSafeRedirect(searchParams.get('redirect'), fallback);
      if (data.verificationEmailSent === true) {
        toast.success('Account created! Check your inbox to verify your email.');
        setContinueTarget(target);
        setVerificationSent(true);
        return;
      }
      toast.success('Account created successfully!');
      router.push(target);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <div>
      <div className="relative mb-4 text-center">
        <Link
          href="/"
          aria-label="Back to home"
          className="absolute left-0 top-1 inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-primary-text"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back to Home</span>
          <span className="sm:hidden">Home</span>
        </Link>
        <Link href="/" className="gradient-text text-xl sm:text-2xl font-black">CodeBettle</Link>
        <h1 className="mt-2 text-lg sm:text-xl font-bold text-foreground">Create Your Account</h1>
        <p className="mt-1 text-sm text-muted">Start your coding journey today</p>
      </div>

      {verificationSent ? (
        <div className="py-2 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-primary/40 bg-primary/10">
            <MailCheck className="h-8 w-8 text-primary-text" />
          </div>
          <h2 className="mt-5 text-lg font-bold text-foreground">Verification email sent!</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            We&apos;ve sent a verification email to{' '}
            <span className="font-semibold text-foreground">{form.email}</span>.
            Click the link in the email to verify your account, then sign in.
          </p>
          <p className="mt-2 text-sm text-muted">
            Didn&apos;t get it? Check your spam folder.
          </p>
          <div className="mt-6 space-y-3">
            <Button type="button" fullWidth size="lg" onClick={() => router.push(signInHref)}>
              Sign In
            </Button>
            <button
              type="button"
              onClick={() => router.push(continueTarget)}
              className="w-full cursor-pointer text-center text-sm font-medium text-primary-text hover:underline"
            >
              Continue to dashboard
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleRegister} className="space-y-2">
          <Input compact label="Full Name" placeholder="Your full name" value={form.name} onChange={set('name')} icon={<User className="h-4 w-4" />} error={errors.name} required />
          <Input compact label="Email Address" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} icon={<Mail className="h-4 w-4" />} error={errors.email} required />
          <Input compact label="Phone Number" type="tel" placeholder="+92 300 0000000" value={form.phone} onChange={set('phone')} icon={<Phone className="h-4 w-4" />} />
          <div className="relative">
            <Input
              compact
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Min. 8 characters"
              value={form.password}
              onChange={set('password')}
              icon={<Lock className="h-4 w-4" />}
              error={errors.password}
              required
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-8 cursor-pointer text-muted hover:text-foreground">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Input compact label="Confirm Password" type="password" placeholder="Repeat your password" value={form.confirmPassword} onChange={set('confirmPassword')} icon={<Lock className="h-4 w-4" />} error={errors.confirmPassword} required />
          <div>
            <Input compact label="Referral code (optional)" placeholder="e.g. U5W5GK" value={form.referralCode} onChange={set('referralCode')} icon={<User className="h-4 w-4" />} error={errors.referralCode} />
            <p className="text-muted text-xs mt-1">Have a code from a CodeBettle ambassador? Enter it here — you get Rs 200 off your first course, and they earn credits for bringing you in.</p>
          </div>
          <Button type="submit" fullWidth size="lg" loading={loading}>Create Account</Button>
        </form>
      )}

      {!verificationSent && (
        <p className="mt-3 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link href={signInHref} className="font-medium text-primary-text hover:underline">Sign in</Link>
        </p>
      )}
    </div>
  );
}
