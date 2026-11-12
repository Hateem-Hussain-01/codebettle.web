'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Mail, Globe, Save, Plus, X, Share2, Code, Phone, Lock, Camera } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import TrackingTimeline, { type TrackingViewShape } from '@/components/applicant/TrackingTimeline';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function InstructorProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    phone: '',
    bio: '',
    avatar: '',
    website: '',
    github: '',
    linkedin: '',
    twitter: '',
  });
  const [expertise, setExpertise] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Phase 2, Module 21: My Applications — the recruitment record that
  // brought this teacher here (status, current stage, recruitment
  // progress, onboarding information). Read from the same applicant
  // tracking API the applicant portal uses (own applications only).
  const [myApps, setMyApps] = useState<Array<{ id: string; status: string; createdAt: string; currentStageName: string; nextStageName: string | null }>>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [openTracking, setOpenTracking] = useState<TrackingViewShape | null>(null);
  const [trackingLoadingId, setTrackingLoadingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/applicant/applications', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setMyApps(data.applications ?? []);
      } catch {
        // The applications section is secondary — profile editing is the priority.
      } finally {
        if (!cancelled) setAppsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadTracking = async (id: string) => {
    if (openTracking?.application.id === id) {
      setOpenTracking(null);
      return;
    }
    setTrackingLoadingId(id);
    try {
      const res = await fetch(`/api/applicant/applications/${id}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not load the application');
        return;
      }
      setOpenTracking(data.tracking);
    } catch {
      toast.error('Could not load the application');
    } finally {
      setTrackingLoadingId(null);
    }
  };

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
        const links = u.socialLinks ?? {};
        setProfile({
          name: u.name ?? '',
          email: u.email ?? '',
          phone: u.phone ?? '',
          bio: u.bio ?? '',
          avatar: u.avatar ?? '',
          website: links.website ?? '',
          github: links.github ?? '',
          linkedin: links.linkedin ?? '',
          twitter: links.twitter ?? '',
        });
        setExpertise(u.expertise ?? []);
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

  const handleSave = async () => {
    if (!profile.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const socialLinks: Record<string, string> = {};
      for (const key of ['website', 'github', 'linkedin', 'twitter'] as const) {
        const value = profile[key].trim();
        if (value) socialLinks[key] = value;
      }
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profile.name.trim(),
          bio: profile.bio.trim() || null,
          phone: profile.phone.trim() || null,
          expertise,
          socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not save your profile');
        return;
      }
      const u = data.user;
      const links = u.socialLinks ?? {};
      setProfile({
        name: u.name,
        email: u.email,
        phone: u.phone ?? '',
        bio: u.bio ?? '',
        avatar: u.avatar ?? '',
        website: links.website ?? '',
        github: links.github ?? '',
        linkedin: links.linkedin ?? '',
        twitter: links.twitter ?? '',
      });
      setExpertise(u.expertise ?? []);
      toast.success('Profile updated!');
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

  const addTag = () => {
    if (newTag.trim() && !expertise.includes(newTag.trim())) {
      setExpertise(e => [...e, newTag.trim()]);
      setNewTag('');
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
        <h1 className="text-2xl font-black text-foreground">My Profile</h1>
        <p className="text-muted text-sm mt-1">Your public instructor profile</p>
      </div>

      <Card>
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-dark-border">
          <div className="relative">
            <img src={avatarSrc} alt={profile.name} className="w-20 h-20 rounded-full object-cover border-2 border-primary/40" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Change profile photo"
              title="Change profile photo"
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-ink flex items-center justify-center hover:bg-primary-dark transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
            <p className="text-foreground font-bold">{profile.name}</p>
            <p className="text-muted text-sm">{profile.email}</p>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-green-400/10 text-green-400 border border-green-400/20 mt-1 inline-block">Instructor</span>
          </div>
        </div>
        {uploading && <p className="text-muted text-xs mb-4 -mt-2">Uploading your photo…</p>}

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Full Name" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} icon={<User className="w-4 h-4" />} />
            <Input label="Email" type="email" value={profile.email} disabled title="Email is your login — it cannot be changed here" icon={<Mail className="w-4 h-4" />} />
          </div>
          <Input label="Phone Number" value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} icon={<Phone className="w-4 h-4" />} />
          <Textarea label="Bio" value={profile.bio} onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))} rows={4} placeholder="Tell students about yourself..." />

          <div>
            <label className="text-sm font-medium text-foreground/80 block mb-2">Expertise Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {expertise.map(tag => (
                <span key={tag} className="flex items-center gap-1 text-xs px-2.5 py-1 bg-primary/10 text-primary-text border border-primary/20 rounded-full">
                  {tag}
                  <button onClick={() => setExpertise(e => e.filter(t => t !== tag))} className="hover:text-red-400 cursor-pointer"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="Add expertise..." onKeyDown={e => e.key === 'Enter' && addTag()} />
              <Button size="sm" variant="secondary" onClick={addTag}><Plus className="w-4 h-4" /></Button>
            </div>
          </div>

          <h3 className="text-foreground font-medium text-sm pt-2">Social Links</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Website" placeholder="https://" value={profile.website} onChange={e => setProfile(p => ({ ...p, website: e.target.value }))} icon={<Globe className="w-4 h-4" />} />
            <Input label="GitHub" placeholder="https://github.com/..." value={profile.github} onChange={e => setProfile(p => ({ ...p, github: e.target.value }))} icon={<Code className="w-4 h-4" />} />
            <Input label="LinkedIn" placeholder="https://linkedin.com/in/..." value={profile.linkedin} onChange={e => setProfile(p => ({ ...p, linkedin: e.target.value }))} icon={<Share2 className="w-4 h-4" />} />
            <Input label="X (Twitter)" placeholder="https://x.com/..." value={profile.twitter} onChange={e => setProfile(p => ({ ...p, twitter: e.target.value }))} />
          </div>

          <Button onClick={handleSave} loading={saving}><Save className="w-4 h-4" />Save Profile</Button>
        </div>
      </Card>

      {/* Change Password */}
      <Card>
        <h2 className="text-foreground font-bold mb-4 flex items-center gap-2"><Lock className="w-4 h-4 text-primary-text" />Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <Input label="Current Password" type="password" placeholder="••••••••" value={passwords.current} onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))} required />
          <Input label="New Password" type="password" placeholder="Min. 8 characters" value={passwords.new} onChange={e => setPasswords(p => ({ ...p, new: e.target.value }))} required />
          <Input label="Confirm New Password" type="password" placeholder="Repeat new password" value={passwords.confirm} onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))} required />
          <Button type="submit" loading={saving} variant="outline"><Lock className="w-4 h-4" />Change Password</Button>
        </form>
      </Card>

      {/* My Applications — recruitment history (Phase 2, Module 21). */}
      <Card>
        <h2 className="text-foreground font-bold mb-1">My Applications</h2>
        <p className="text-muted text-sm mb-4">Your instructor application(s), recruitment progress and onboarding information.</p>
        {appsLoading && <p className="text-muted text-sm">Loading your applications…</p>}
        {!appsLoading && myApps.length === 0 && (
          <p className="text-muted text-sm">No applications on file — your account was created another way (invitation or admin setup).</p>
        )}
        {!appsLoading && myApps.length > 0 && (
          <div className="space-y-3">
            {myApps.map((app) => (
              <div key={app.id} className="border border-dark-border rounded-lg p-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground text-sm font-mono truncate">{app.id}</p>
                    <p className="text-muted text-xs mt-1">
                      Submitted {formatDateShort(app.createdAt)} · Current stage: <span className="text-foreground">{app.currentStageName}</span>
                      {app.currentStageName === 'Successfully Onboarded' ? ' — onboarding complete' : ''}
                      {app.nextStageName ? <> · Next: <span className="text-foreground">{app.nextStageName}</span></> : ''}
                    </p>
                  </div>
                  <Badge variant={app.status === 'approved' ? 'success' : app.status === 'rejected' ? 'danger' : 'warning'}>
                    {app.status}
                  </Badge>
                  <Button size="sm" variant="secondary" onClick={() => loadTracking(app.id)} loading={trackingLoadingId === app.id}>
                    {openTracking?.application.id === app.id ? 'Hide progress' : 'Recruitment progress'}
                  </Button>
                </div>
                {openTracking?.application.id === app.id && (
                  <div className="mt-4">
                    <TrackingTimeline tracking={openTracking} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
