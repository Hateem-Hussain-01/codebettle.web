'use client';
import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { getSafeRedirect } from '@/lib/security';
import toast from 'react-hot-toast';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
    <div className="bg-dark-card border border-dark-border rounded-2xl p-8">
      <div className="text-center mb-8">
        <Link href="/" className="text-2xl font-black gradient-text">CodeBettle</Link>
        <h1 className="text-xl font-bold text-white mt-4">Welcome Back</h1>
        <p className="text-muted text-sm mt-1">Sign in to continue your learning journey</p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
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
        <div className="relative">
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Your password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            icon={<Lock className="w-4 h-4" />}
            required
          />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-8 text-muted hover:text-white cursor-pointer">
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <Button type="submit" fullWidth size="lg" loading={loading}>Sign In</Button>
      </form>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted mt-6">
        <ShieldCheck className="w-3.5 h-3.5 text-primary" />
        Protected by secure sign-in
      </p>

      <p className="text-center text-sm text-muted mt-4">
        Don&apos;t have an account?{' '}
        <Link href="/auth/register" className="text-primary hover:underline font-medium">Sign up free</Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-16">
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-[100px]" />
      </div>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
        <Suspense fallback={<div className="text-muted text-center">Loading...</div>}>
          <LoginForm />
        </Suspense>
      </motion.div>
    </div>
  );
}
