'use client';
import { useState } from 'react';
import { User, Mail, Globe, Save, Plus, X, Share2, Code } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Card from '@/components/ui/Card';
import toast from 'react-hot-toast';

export default function InstructorProfilePage() {
  const [profile, setProfile] = useState({ name: 'Usman Ali', email: 'usman@codebettle.com', bio: 'Full-stack developer with 8+ years of experience in React, Node.js, and cloud technologies.', website: '', github: 'https://github.com', linkedin: 'https://linkedin.com', twitter: '' });
  const [expertise, setExpertise] = useState(['React', 'Node.js', 'TypeScript', 'AWS']);
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    toast.success('Profile updated!');
    setSaving(false);
  };

  const addTag = () => {
    if (newTag.trim() && !expertise.includes(newTag.trim())) {
      setExpertise(e => [...e, newTag.trim()]);
      setNewTag('');
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-white">My Profile</h1>
        <p className="text-muted text-sm mt-1">Your public instructor profile</p>
      </div>

      <Card>
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-dark-border">
          <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(profile.name)}&backgroundColor=1C1C1C&textColor=F5C518`} alt={profile.name} className="w-20 h-20 rounded-full border-2 border-primary/40" />
          <div>
            <p className="text-white font-bold">{profile.name}</p>
            <p className="text-muted text-sm">{profile.email}</p>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-green-400/10 text-green-400 border border-green-400/20 mt-1 inline-block">Instructor</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Full Name" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} icon={<User className="w-4 h-4" />} />
            <Input label="Email" type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} icon={<Mail className="w-4 h-4" />} />
          </div>
          <Textarea label="Bio" value={profile.bio} onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))} rows={4} placeholder="Tell students about yourself..." />

          <div>
            <label className="text-sm font-medium text-white/80 block mb-2">Expertise Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {expertise.map(tag => (
                <span key={tag} className="flex items-center gap-1 text-xs px-2.5 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full">
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

          <h3 className="text-white font-medium text-sm pt-2">Social Links</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Website" placeholder="https://" value={profile.website} onChange={e => setProfile(p => ({ ...p, website: e.target.value }))} icon={<Globe className="w-4 h-4" />} />
            <Input label="GitHub" placeholder="https://github.com/..." value={profile.github} onChange={e => setProfile(p => ({ ...p, github: e.target.value }))} icon={<Code className="w-4 h-4" />} />
            <Input label="LinkedIn" placeholder="https://linkedin.com/in/..." value={profile.linkedin} onChange={e => setProfile(p => ({ ...p, linkedin: e.target.value }))} icon={<Share2 className="w-4 h-4" />} />
            <Input label="X (Twitter)" placeholder="https://x.com/..." value={profile.twitter} onChange={e => setProfile(p => ({ ...p, twitter: e.target.value }))} />
          </div>

          <Button onClick={handleSave} loading={saving}><Save className="w-4 h-4" />Save Profile</Button>
        </div>
      </Card>
    </div>
  );
}
