'use client';
import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, MailCheck, CheckCircle2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import toast from 'react-hot-toast';

/**
 * Forgot / reset password page.
 *
 * Two states, driven by ?token=...:
 * - No token: "Forgot your password?" — enter your email; POSTs
 *   { action: 'request', email } to /api/auth/reset. The API always
 *   returns the same generic success (no enumeration oracle), so the
 *   page shows that message either way.
 * - With token: "Set a new password" — new password + confirm; POSTs
 *   { action: 'reset', token, newPassword, confirmPassword }.
 *   The token is single-use and expires after 60 minutes (server).
 *
 * This page is why the reset link in the password-reset email works:
 * it points to /auth/reset?token=... . It is a standalone page (not
 * part of the login/register sliding panel).
 */
function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) { toast.error('Please enter a valid email address'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request', email }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Something went wrong'); return; }
      setRequested(true);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', token, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'This reset link is invalid or has expired'); return; }
      setResetDone(true);
      toast.success('Password updated successfully!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-dark-card border border-dark-border rounded-2xl p-8">
      <div className="text-center mb-8">
        <Link href="/" className="text-2xl font-black gradient-text">CodeBettle</Link>
        <h1 className="text-xl font-bold text-white mt-4">
          {token ? 'Set a new password' : 'Forgot your password?'}
        </h1>
        <p className="text-muted text-sm mt-1">
          {token
            ? 'Choose a new password for your account.'
            : 'Enter your email and we will send you a reset link.'}
        </p>
      </div>

      {token ? (
        resetDone ? (
          <div className="text-center">
            <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
            <h2 className="text-lg font-bold text-white mt-4">Password updated!</h2>
            <p className="text-muted text-sm mt-2">
              Your password has been changed. You can now sign in with your new password.
            </p>
            <Link href="/auth/login">
              <Button fullWidth size="lg" className="mt-6">Sign In</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <div className="relative">
              <Input
                label="New Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                icon={<Lock className="w-4 h-4" />}
                required
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-8 text-muted hover:text-white cursor-pointer">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Input
              label="Confirm New Password"
              type="password"
              placeholder="Repeat your new password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              icon={<Lock className="w-4 h-4" />}
              required
            />
            <Button type="submit" fullWidth size="lg" loading={loading}>Reset Password</Button>
          </form>
        )
      ) : requested ? (
        <div className="text-center">
          <MailCheck className="w-12 h-12 text-primary mx-auto" />
          <h2 className="text-lg font-bold text-white mt-4">Check your inbox</h2>
          <p className="text-muted text-sm mt-2">
            If an account exists for <span className="text-white font-medium">{email}</span>, a reset link has been sent.
            The link expires after 60 minutes.
          </p>
          <p className="text-muted text-xs mt-2">Didn&apos;t get it? Check your spam folder.</p>
        </div>
      ) : (
        <form onSubmit={handleRequest} className="space-y-4">
          <Input
            label="Email Address"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            icon={<Mail className="w-4 h-4" />}
            required
          />
          <Button type="submit" fullWidth size="lg" loading={loading}>Send Reset Link</Button>
        </form>
      )}

      <p className="text-center text-sm text-muted mt-6">
        Remembered your password?{' '}
        <Link href="/auth/login" className="text-primary hover:underline font-medium">Back to Sign In</Link>
      </p>
    </div>
  );
}

export default function ResetPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-16">
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-[100px]" />
      </div>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
        <Suspense fallback={<div className="text-muted text-center">Loading...</div>}>
          <ResetForm />
        </Suspense>
      </motion.div>
    </div>
  );
}
