'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, User, Phone, Eye, EyeOff } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.includes('@')) e.email = 'Valid email required';
    if (form.password.length < 6) e.password = 'Password must be at least 6 characters';
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
      toast.success('Account created successfully!');
      router.push('/student/dashboard');
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-16">
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-[100px]" />
      </div>

      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
        <div className="bg-dark-card border border-dark-border rounded-2xl p-8">
          <div className="text-center mb-8">
            <Link href="/" className="text-2xl font-black gradient-text">CodeBettle</Link>
            <h1 className="text-xl font-bold text-white mt-4">Create Your Account</h1>
            <p className="text-muted text-sm mt-1">Start your coding journey today — it's free!</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <Input label="Full Name" placeholder="Your full name" value={form.name} onChange={set('name')} icon={<User className="w-4 h-4" />} error={errors.name} required />
            <Input label="Email Address" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} icon={<Mail className="w-4 h-4" />} error={errors.email} required />
            <Input label="Phone Number" type="tel" placeholder="+92 300 0000000" value={form.phone} onChange={set('phone')} icon={<Phone className="w-4 h-4" />} />
            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 6 characters"
                value={form.password}
                onChange={set('password')}
                icon={<Lock className="w-4 h-4" />}
                error={errors.password}
                required
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-8 text-muted hover:text-white cursor-pointer">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Input label="Confirm Password" type="password" placeholder="Repeat your password" value={form.confirmPassword} onChange={set('confirmPassword')} icon={<Lock className="w-4 h-4" />} error={errors.confirmPassword} required />
            <Button type="submit" fullWidth size="lg" loading={loading}>Create Account</Button>
          </form>

          <p className="text-center text-sm text-muted mt-6">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-primary hover:underline font-medium">Sign in</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
