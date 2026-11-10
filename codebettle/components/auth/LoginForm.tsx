'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { getSafeRedirect } from '@/lib/security';
import toast from 'react-hot-toast';

/**
 * Sign In form — the left half of the sliding auth card.
 * Logic unchanged from the original login page: posts to /api/auth with
 * action 'login' and redirects to /{role}/dashboard (or ?redirect=...).
 * The Student | Instructor tabs and the Become an Instructor link are kept.
 */
export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [role, setRole] = useState<'student' | 'instructor'>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success(`Welcome back, ${data.user.name}!`);
      const redirect = getSafeRedirect(searchParams.get('redirect'), `/${data.user.role}/dashboard`);
      router.push(redirect);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-8 text-center">
        <Link href="/" className="gradient-text text-2xl font-black">CodeBettle</Link>
        <h1 className="mt-4 text-xl font-bold text-white">Welcome Back</h1>
        <p className="mt-1 text-sm text-muted">Sign in to continue your learning journey</p>
      </div>

      <div role="tablist" aria-label="Sign in as" className="mb-6 grid grid-cols-2 gap-1 rounded-lg border border-dark-border bg-background p-1">
        <button
          type="button"
          role="tab"
          aria-selected={role === 'student'}
          onClick={() => setRole('student')}
          className={`cursor-pointer rounded-md px-3 py-2 text-sm font-semibold transition-colors ${role === 'student' ? 'bg-primary text-dark' : 'text-muted hover:text-white'}`}
        >
          Student
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={role === 'instructor'}
          onClick={() => setRole('instructor')}
          className={`cursor-pointer rounded-md px-3 py-2 text-sm font-semibold transition-colors ${role === 'instructor' ? 'bg-primary text-dark' : 'text-muted hover:text-white'}`}
        >
          Instructor
        </button>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <Input
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
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Your password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            icon={<Lock className="h-4 w-4" />}
            required
          />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-8 cursor-pointer text-muted hover:text-white">
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-right text-sm">
          <Link href="/auth/reset" className="text-primary hover:underline font-medium">Forgot password?</Link>
        </p>
        <Button type="submit" fullWidth size="lg" loading={loading}>Sign In</Button>
      </form>

      {role === 'instructor' && (
        <p className="mt-6 text-center text-sm text-muted">
          Want to teach?{' '}
          <Link href="/become-instructor" className="font-medium text-primary hover:underline">Become an Instructor</Link>
        </p>
      )}

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
        Protected by secure sign-in
      </p>

      <p className="mt-4 text-center text-sm text-muted">
        Don&apos;t have an account?{' '}
        <Link href="/auth/register" className="font-medium text-primary hover:underline">Sign up free</Link>
      </p>
    </div>
  );
}
