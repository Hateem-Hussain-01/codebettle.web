'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, Mail, MailCheck, Phone, User } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
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
 */
export default function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [verificationSent, setVerificationSent] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.includes('@')) e.email = 'Valid email required';
    if (form.password.length < 8) e.password = 'Password must be at least 8 characters';
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
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
        body: JSON.stringify({ action: 'register', ...form }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      if (data.verificationEmailSent === true) {
        toast.success('Account created! Check your inbox to verify your email.');
        setVerificationSent(true);
        return;
      }
      toast.success('Account created successfully!');
      router.push('/student/dashboard');
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <div>
      <div className="mb-5 text-center">
        <Link href="/" className="gradient-text text-2xl font-black">CodeBettle</Link>
        <h1 className="mt-3 text-xl font-bold text-white">Create Your Account</h1>
        <p className="mt-1 text-sm text-muted">Start your coding journey today</p>
      </div>

      {verificationSent ? (
        <div className="py-2 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-primary/40 bg-primary/10">
            <MailCheck className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mt-5 text-lg font-bold text-white">Verification email sent!</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            We&apos;ve sent a verification email to{' '}
            <span className="font-semibold text-white">{form.email}</span>.
            Click the link in the email to verify your account, then sign in.
          </p>
          <p className="mt-2 text-sm text-muted">
            Didn&apos;t get it? Check your spam folder.
          </p>
          <div className="mt-6 space-y-3">
            <Button type="button" fullWidth size="lg" onClick={() => router.push('/auth/login')}>
              Sign In
            </Button>
            <button
              type="button"
              onClick={() => router.push('/student/dashboard')}
              className="w-full cursor-pointer text-center text-sm font-medium text-primary hover:underline"
            >
              Continue to dashboard
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleRegister} className="space-y-3">
          <Input label="Full Name" placeholder="Your full name" value={form.name} onChange={set('name')} icon={<User className="h-4 w-4" />} error={errors.name} required />
          <Input label="Email Address" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} icon={<Mail className="h-4 w-4" />} error={errors.email} required />
          <Input label="Phone Number" type="tel" placeholder="+92 300 0000000" value={form.phone} onChange={set('phone')} icon={<Phone className="h-4 w-4" />} />
          <div className="relative">
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Min. 8 characters"
              value={form.password}
              onChange={set('password')}
              icon={<Lock className="h-4 w-4" />}
              error={errors.password}
              required
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-8 cursor-pointer text-muted hover:text-white">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Input label="Confirm Password" type="password" placeholder="Repeat your password" value={form.confirmPassword} onChange={set('confirmPassword')} icon={<Lock className="h-4 w-4" />} error={errors.confirmPassword} required />
          <Button type="submit" fullWidth size="lg" loading={loading}>Create Account</Button>
        </form>
      )}

      {!verificationSent && (
        <p className="mt-4 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link href="/auth/login" className="font-medium text-primary hover:underline">Sign in</Link>
        </p>
      )}
    </div>
  );
}
