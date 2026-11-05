'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Card from '@/components/ui/Card';
import { Save, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminContentPage() {
  const [hero, setHero] = useState({ headline1: 'Become a', tagline: "Pakistan's #1 Digital Institute", subtext: 'Expert-led courses in web development, mobile apps, data science, and design. Learn from industry professionals and build real-world projects.' });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    toast.success('Content updated!');
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-white">Content Manager</h1>
        <p className="text-muted text-sm mt-1">Edit homepage and site-wide content</p>
      </div>

      <Card>
        <h2 className="text-white font-bold mb-4 flex items-center gap-2"><FileText className="w-4 h-4 text-primary" />Hero Section</h2>
        <div className="space-y-4">
          <Input label="Top Badge Text" value={hero.tagline} onChange={e => setHero(h => ({ ...h, tagline: e.target.value }))} placeholder="e.g., Pakistan's #1 Digital Institute" />
          <Textarea label="Subtext / Description" value={hero.subtext} onChange={e => setHero(h => ({ ...h, subtext: e.target.value }))} rows={3} />
        </div>
      </Card>

      <Card>
        <h2 className="text-white font-bold mb-4">Typewriter Words</h2>
        <p className="text-muted text-sm mb-4">These rotate in the hero headline. Edit in <code className="text-primary text-xs bg-dark-border px-1.5 py-0.5 rounded">components/sections/HeroSection.tsx</code>.</p>
        <div className="space-y-2">
          {['Web Developer', 'Mobile Developer', 'Data Scientist', 'UI/UX Designer', 'DevOps Engineer'].map(word => (
            <div key={word} className="flex items-center gap-2 text-sm text-muted bg-dark-border/30 px-3 py-2 rounded-lg">
              <span className="w-2 h-2 bg-primary rounded-full" />
              {word}
            </div>
          ))}
        </div>
      </Card>

      <Button onClick={handleSave} loading={saving} size="lg"><Save className="w-4 h-4" />Save Content</Button>
    </div>
  );
}
