'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Mail, Phone, Lock, Save, Camera } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Card from '@/components/ui/Card';
import toast from 'react-hot-toast';

export default function StudentProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState({ name: '', email: '', phone: '', bio: '', avatar: '' });
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Load the real signed-in user — never a hardcoded demo user.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/profile', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          toast.error(data.error || 'Could not load your profile');
          return;
        }
        const u = data.user;
        setProfile({
          name: u.name ?? '',
          email: u.email ?? '',
          phone: u.phone ?? '',
          bio: u.bio ?? '',
          avatar: u.avatar ?? '',
        });
      } catch {
        if (!cancelled) toast.error('Could not load your profile — please try again');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const avatarSrc = profile.avatar ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(profile.name || 'User')}&backgroundColor=1C1C1C&textColor=F5C518`;

  const handleSaveProfile = async () => {
    if (!profile.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profile.name.trim(),
          bio: profile.bio.trim() || null,
          phone: profile.phone.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not save your profile');
        return;
      }
      const u = data.user;
      setProfile({
        name: u.name,
        email: u.email,
        phone: u.phone ?? '',
        bio: u.bio ?? '',
        avatar: u.avatar ?? '',
      });
      toast.success('Profile updated successfully!');
      router.refresh();
    } catch {
      toast.error('Could not save your profile — please try again');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be picked again after a failed upload.
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('avatar', file);
      const res = await fetch('/api/profile/avatar', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not upload your photo');
        return;
      }
      setProfile((p) => ({ ...p, avatar: data.user.avatar ?? p.avatar }));
      toast.success('Profile photo updated!');
      router.refresh();
    } catch {
      toast.error('Could not upload your photo — please try again');
    } finally {
      setUploading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      toast.error('New passwords do not match');
      return;
    }
    if (passwords.new.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change-password',
          currentPassword: passwords.current,
          newPassword: passwords.new,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not change your password');
        return;
      }
      toast.success('Password changed!');
      setPasswords({ current: '', new: '', confirm: '' });
    } catch {
      toast.error('Could not change your password — please try again');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <p className="text-muted text-sm">Loading your profile…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-white">My Profile</h1>
        <p className="text-muted text-sm mt-1">Manage your account details</p>
      </div>

      {/* Avatar */}
      <Card>
        <div className="flex items-center gap-6">
          <div className="relative">
            <img
              src={avatarSrc}
              alt={profile.name}
              className="w-20 h-20 rounded-full object-cover border-2 border-primary/40"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Change profile photo"
              title="Change profile photo"
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-dark flex items-center justify-center hover:bg-primary-dark transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <div>
            <p className="text-white font-semibold">{profile.name}</p>
            <p className="text-muted text-sm">{profile.email}</p>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-400/10 text-blue-400 border border-blue-400/20 mt-1 inline-block">Student</span>
          </div>
        </div>
        {uploading && <p className="text-muted text-xs mt-3">Uploading your photo…</p>}
      </Card>

      {/* Profile Form */}
      <Card>
        <h2 className="text-white font-bold mb-4 flex items-center gap-2"><User className="w-4 h-4 text-primary" />Personal Info</h2>
        <div className="space-y-4">
          <Input label="Full Name" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} icon={<User className="w-4 h-4" />} />
          <Input label="Email Address" type="email" value={profile.email} disabled title="Email is your login — it cannot be changed here" icon={<Mail className="w-4 h-4" />} />
          <Input label="Phone Number" value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} icon={<Phone className="w-4 h-4" />} />
          <Textarea label="Bio" value={profile.bio} onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))} rows={3} placeholder="Tell us a little about yourself..." />
          <Button onClick={handleSaveProfile} loading={saving}><Save className="w-4 h-4" />Save Changes</Button>
        </div>
      </Card>

      {/* Change Password */}
      <Card>
        <h2 className="text-white font-bold mb-4 flex items-center gap-2"><Lock className="w-4 h-4 text-primary" />Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <Input label="Current Password" type="password" placeholder="••••••••" value={passwords.current} onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))} required />
          <Input label="New Password" type="password" placeholder="Min. 8 characters" value={passwords.new} onChange={e => setPasswords(p => ({ ...p, new: e.target.value }))} required />
          <Input label="Confirm New Password" type="password" placeholder="Repeat new password" value={passwords.confirm} onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))} required />
          <Button type="submit" loading={saving} variant="outline"><Lock className="w-4 h-4" />Change Password</Button>
        </form>
      </Card>
    </div>
  );
}
