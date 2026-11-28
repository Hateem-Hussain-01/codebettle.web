'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { getSafeRedirect } from '@/lib/security';
import toast from 'react-hot-toast';

/**
 * Sign In form — the left half of the sliding auth card.
 * Posts to /api/auth with action 'login' and redirects to
 * /{role}/dashboard (or ?redirect=...). The Student | Instructor tabs
 * are REAL now: the selected tab is sent as requestedRole, and the
 * server rejects the sign-in (no session) when the account does not
 * hold that tab's capability — the server's instruction is then shown
 * inline under the tabs so the user sees which tab to switch to.
 * The Become an Instructor link is kept.
 *
 * `adminOnly` (secret admin sign-in page only): a single Admin tab,
 * no Student / Instructor tabs and no tab switching, and the form
 * sends requestedRole 'admin'. The server then only lets accounts
 * with admin capability through.
 *
 * `showAmbassadorLink` (Eman, 16 Nov 2026): a "Login as Ambassador"
 * link at the very bottom of the form, to /ambassador/login. Shown
 * by default — EXCEPT on the ambassador login page itself (it would
 * link to itself; that page passes false) and on the secret admin
 * sign-in (adminOnly). The footer link and the /become-ambassador
 * link are the other two surfaces; this is the third.
 */
export default function LoginForm({
  adminOnly = false,
  showAmbassadorLink = true,
}: {
  adminOnly?: boolean;
  showAmbassadorLink?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [role, setRole] = useState<'student' | 'instructor' | 'admin'>(adminOnly ? 'admin' : 'student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // The server's role-mismatch instruction (403). Shown inline, not as
  // a toast, so it stays visible while the user looks at the tabs.
  // Cleared as soon as the user switches tabs — switching is the fix.
  const [roleMismatch, setRoleMismatch] = useState<string | null>(null);

  const switchTab = (next: 'student' | 'instructor') => {
    setRole(next);
    setRoleMismatch(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setRoleMismatch(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password, requestedRole: role }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 403 = role mismatch: the instruction goes inline under the
        // tabs (no toast, so it is not shown twice). Every other
        // error keeps the toast, as before.
        if (res.status === 403) { setRoleMismatch(data.error); return; }
        toast.error(data.error);
        return;
      }
      toast.success(`Welcome back, ${data.user.name}!`);
      // dashboardUrl comes from the login API: for admins it is the
      // secret admin dashboard (PR #33). Fall back to the role path
      // for older responses that do not carry it.
      const fallback = typeof data.dashboardUrl === 'string' ? data.dashboardUrl : `/${data.user.role}/dashboard`;
      const redirect = getSafeRedirect(searchParams.get('redirect'), fallback);
      router.push(redirect);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-4 text-center">
        <Link href="/" className="gradient-text text-xl sm:text-2xl font-black">CodeBettle</Link>
        <h1 className="mt-2 text-lg sm:text-xl font-bold text-foreground">Welcome Back</h1>
        <p className="mt-1 text-sm text-muted">Sign in to continue your learning journey</p>
      </div>

      {adminOnly ? (
        <div role="tablist" aria-label="Sign in as" className="mb-3 rounded-lg border border-dark-border bg-background p-1">
          <button
            type="button"
            role="tab"
            aria-selected
            className="w-full cursor-default rounded-md bg-primary px-3 py-2 text-sm font-semibold text-ink"
          >
            Admin
          </button>
        </div>
      ) : (
        <div role="tablist" aria-label="Sign in as" className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-dark-border bg-background p-1">
          <button
            type="button"
            role="tab"
            aria-selected={role === 'student'}
            onClick={() => switchTab('student')}
            className={`cursor-pointer rounded-md px-3 py-2 text-sm font-semibold transition-colors ${role === 'student' ? 'bg-primary text-ink' : 'text-muted hover:text-foreground'}`}
          >
            Student
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={role === 'instructor'}
            onClick={() => switchTab('instructor')}
            className={`cursor-pointer rounded-md px-3 py-2 text-sm font-semibold transition-colors ${role === 'instructor' ? 'bg-primary text-ink' : 'text-muted hover:text-foreground'}`}
          >
            Instructor
          </button>
        </div>
      )}

      {roleMismatch && (
        <div role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary-text" />
          <span>{roleMismatch}</span>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-2">
        <Input
          compact
          label="Email Address"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          icon={<Mail className="h-4 w-4" />}
          required
        />
        <div className="relative">
          <Input
            compact
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Your password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            icon={<Lock className="h-4 w-4" />}
            required
          />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-8 cursor-pointer text-muted hover:text-foreground">
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-right text-sm">
          <Link href="/auth/reset" className="text-primary-text hover:underline font-medium">Forgot password?</Link>
        </p>
        <Button type="submit" fullWidth size="lg" loading={loading}>Sign In</Button>
      </form>

      {role === 'instructor' && (
        <p className="mt-3 text-center text-sm text-muted">
          Want to teach?{' '}
          <Link href="/become-instructor" className="font-medium text-primary-text hover:underline">Become an Instructor</Link>
        </p>
      )}

      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
        <ShieldCheck className="h-3.5 w-3.5 text-primary-text" />
        Protected by secure sign-in
      </p>

      <p className="mt-3 text-center text-sm text-muted">
        Don&apos;t have an account?{' '}
        <Link
          href={
            searchParams.get('redirect')
              ? `/auth/register?redirect=${encodeURIComponent(searchParams.get('redirect')!)}`
              : '/auth/register'
          }
          className="font-medium text-primary-text hover:underline"
        >
          Sign up
        </Link>
      </p>

      {showAmbassadorLink && !adminOnly && (
        <p className="mt-3 text-center text-sm text-muted">
          Are you an ambassador?{' '}
          <Link href="/ambassador/login?redirect=/student/ambassador" className="font-medium text-primary-text hover:underline">
            Login as Ambassador
          </Link>
        </p>
      )}
    </div>
  );
}
