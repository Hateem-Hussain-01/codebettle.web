'use client';
import { useState } from 'react';
import { User, Mail, Phone, Lock, Save, Camera } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import toast from 'react-hot-toast';

export default function StudentProfilePage() {
  const [profile, setProfile] = useState({ name: 'Ali Raza', email: 'ali.raza@gmail.com', phone: '+92 300 1234567' });
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  const handleSaveProfile = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    toast.success('Profile updated successfully!');
    setSaving(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) { toast.error('New passwords do not match'); return; }
    if (passwords.new.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    toast.success('Password changed!');
    setPasswords({ current: '', new: '', confirm: '' });
    setSaving(false);
  };

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
              src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(profile.name)}&backgroundColor=1C1C1C&textColor=F5C518`}
              alt={profile.name}
              className="w-20 h-20 rounded-full border-2 border-primary/40"
            />
            <button className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-dark flex items-center justify-center hover:bg-primary-dark transition-colors cursor-pointer">
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>
          <div>
            <p className="text-white font-semibold">{profile.name}</p>
            <p className="text-muted text-sm">{profile.email}</p>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-400/10 text-blue-400 border border-blue-400/20 mt-1 inline-block">Student</span>
          </div>
        </div>
      </Card>

      {/* Profile Form */}
      <Card>
        <h2 className="text-white font-bold mb-4 flex items-center gap-2"><User className="w-4 h-4 text-primary" />Personal Info</h2>
        <div className="space-y-4">
          <Input label="Full Name" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} icon={<User className="w-4 h-4" />} />
          <Input label="Email Address" type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} icon={<Mail className="w-4 h-4" />} />
          <Input label="Phone Number" value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} icon={<Phone className="w-4 h-4" />} />
          <Button onClick={handleSaveProfile} loading={saving}><Save className="w-4 h-4" />Save Changes</Button>
        </div>
      </Card>

      {/* Change Password */}
      <Card>
        <h2 className="text-white font-bold mb-4 flex items-center gap-2"><Lock className="w-4 h-4 text-primary" />Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <Input label="Current Password" type="password" placeholder="••••••••" value={passwords.current} onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))} required />
          <Input label="New Password" type="password" placeholder="Min. 6 characters" value={passwords.new} onChange={e => setPasswords(p => ({ ...p, new: e.target.value }))} required />
          <Input label="Confirm New Password" type="password" placeholder="Repeat new password" value={passwords.confirm} onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))} required />
          <Button type="submit" loading={saving} variant="outline"><Lock className="w-4 h-4" />Change Password</Button>
        </form>
      </Card>
    </div>
  );
}
