'use client';
import { useEffect, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';
import { Camera, Save } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Applicant profile: first/last name, email (read-only — it is the
 * login identity), contact number, profile picture and basic info.
 * Backed by the same /api/profile endpoints the instructor profile
 * uses — one profile, one source of truth, shared across portals.
 * The account name is stored as a single `name`; first/last are
 * split on the first space for editing and joined on save.
 */
export default function ApplicantProfilePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

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
        const parts = String(u.name ?? '').trim().split(/\s+/);
        setFirstName(parts[0] ?? '');
        setLastName(parts.slice(1).join(' '));
        setEmail(u.email ?? '');
        setPhone(u.phone ?? '');
        setBio(u.bio ?? '');
        setAvatar(u.avatar ?? '');
      } catch {
        if (!cancelled) toast.error('Could not load your profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const avatarSrc =
    avatar ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(`${firstName} ${lastName}`.trim() || 'User')}&backgroundColor=1C1C1C&textColor=F5C518`;

  const handleSave = async () => {
    const name = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!name) {
      toast.error('First name is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone: phone.trim() || null, bio: bio.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not save your profile');
        return;
      }
      toast.success('Profile updated!');
    } catch {
      toast.error('Could not save your profile — please try again');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
      setAvatar(data.user.avatar ?? avatar);
      toast.success('Profile photo updated!');
    } catch {
      toast.error('Could not upload your photo — please try again');
    } finally {
      setUploading(false);
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
      <FadeIn>
        <h1 className="text-2xl font-black text-white">My Profile</h1>
        <p className="text-muted text-sm mt-1">Your applicant profile — the same details travel with you when you are onboarded as a teacher.</p>
      </FadeIn>

      <Card>
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-dark-border">
          <div className="relative">
            <img src={avatarSrc} alt={`${firstName} ${lastName}`.trim()} className="w-20 h-20 rounded-full object-cover border-2 border-primary/40" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Change profile photo"
              title="Change profile photo"
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-dark flex items-center justify-center hover:bg-primary-dark transition-colors cursor-pointer disabled:opacity-50"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div>
            <p className="text-white font-semibold">{`${firstName} ${lastName}`.trim() || 'Your name'}</p>
            <p className="text-muted text-xs">{email}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="First name *" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
            <Input label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
          </div>
          <Input label="Email" value={email} disabled placeholder="Your account email" />
          <Input label="Contact number" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92 ..." />
          <Textarea label="About you" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A short introduction (optional)" rows={3} />
          <Button onClick={handleSave} loading={saving}>
            <Save className="w-4 h-4" /> Save Profile
          </Button>
        </div>
      </Card>
    </div>
  );
}
