'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Eye, EyeOff, ShieldCheck, CheckCircle2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import toast from 'react-hot-toast';
import type { SetupStatusEntry } from '@/lib/services/first-run';

/**
 * First-run admin setup form. The two official admins (Hateem Hussain,
 * COO, and Ahmad Hassan, CEO) pick their own passwords here. Claimed
 * identities are disabled — an account can only be set up once.
 */
export default function SetupForm({ admins }: { admins: SetupStatusEntry[] }) {
  const router = useRouter();
  const firstUnclaimed = admins.find((a) => !a.claimed);
  const [email, setEmail] = useState(firstUnclaimed?.email ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error);
        return;
      }
      setDone(data.user.name);
      toast.success('Admin account created');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="bg-dark-card border border-dark-border rounded-2xl p-8 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-white">Welcome, {done}</h1>
        <p className="text-muted text-sm mt-2">
          Your admin account is ready. Sign in with the password you just chose.
        </p>
        <div className="mt-6">
          <Button onClick={() => router.push('/auth/login')}>Go to Sign In</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dark-card border border-dark-border rounded-2xl p-8">
      <div className="text-center mb-8">
        <Link href="/" className="text-2xl font-black gradient-text">
          CodeBettle
        </Link>
        <h1 className="text-xl font-bold text-white mt-4">First-Run Admin Setup</h1>
        <p className="text-muted text-sm mt-1">
          Choose your admin account and set your own password. Only the two official
          administrators can sign up here.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-white mb-2">Administrator</label>
          <div className="space-y-2">
            {admins.map((admin) => (
              <label
                key={admin.email}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer ${
                  admin.claimed
                    ? 'border-dark-border opacity-50 cursor-not-allowed'
                    : email === admin.email
                      ? 'border-primary bg-primary/10'
                      : 'border-dark-border hover:border-primary/50'
                }`}
              >
                <input
                  type="radio"
                  name="admin"
                  value={admin.email}
                  checked={email === admin.email}
                  disabled={admin.claimed}
                  onChange={() => setEmail(admin.email)}
                  className="accent-yellow-500"
                />
                <span>
                  <span className="block text-sm font-semibold text-white">
                    {admin.name} — {admin.title}
                  </span>
                  <span className="block text-xs text-muted">
                    {admin.email}
                    {admin.claimed ? ' · Already set up' : ''}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="relative">
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Choose a strong password (min 8 characters)"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={<Lock className="w-4 h-4" />}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-8 text-muted hover:text-white cursor-pointer"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <Input
          label="Confirm Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Repeat your password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          icon={<Lock className="w-4 h-4" />}
          required
        />
        <Button type="submit" fullWidth size="lg" loading={loading}>
          Create Admin Account
        </Button>
      </form>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted mt-6">
        <ShieldCheck className="w-3.5 h-3.5 text-primary" />
        Your password is hashed before it is stored — it is never written to a file or email.
      </p>
    </div>
  );
}
