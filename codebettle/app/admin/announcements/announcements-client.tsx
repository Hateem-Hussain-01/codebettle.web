'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import { Bell, Plus, Trash2 } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { Announcement } from '@/lib/db/types';

type Ann = Announcement;

interface AnnouncementsClientProps {
  announcements: Announcement[];
}

export default function AnnouncementsClient({ announcements: allAnnouncements }: AnnouncementsClientProps) {
  const sitewide = allAnnouncements.filter(a => a.type === 'site-wide');
  const [list, setList] = useState(sitewide);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ title: '', content: '' });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.content.trim()) { toast.error('Title and content required'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title, content: form.content, type: 'site-wide' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not publish the announcement');
        return;
      }
      setList(l => [data.announcement as Ann, ...l]);
      toast.success('Announcement published!');
      setIsOpen(false);
      setForm({ title: '', content: '' });
    } catch {
      toast.error('Could not publish the announcement — please try again');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ann: Ann) => {
    try {
      const res = await fetch(`/api/admin/announcements/${ann.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Could not delete the announcement');
        return;
      }
      setList(l => l.filter(a => a.id !== ann.id));
      toast.success('Deleted');
    } catch {
      toast.error('Could not delete the announcement — please try again');
    }
  };

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Announcements</h1>
          <p className="text-muted text-sm mt-1">Site-wide announcements visible to all users</p>
        </div>
        <Button onClick={() => setIsOpen(true)}><Plus className="w-4 h-4" />New Announcement</Button>
      </FadeIn>

      {list.length === 0 ? (
        <Card className="py-16 text-center">
          <Bell className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-white font-semibold mb-2">No announcements</p>
          <Button size="sm" onClick={() => setIsOpen(true)}>Create First Announcement</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((ann, i) => (
            <FadeIn key={ann.id} delay={Math.min(i, 4) * 0.05}>
            <Card hover className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0"><Bell className="w-5 h-5" /></div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white font-semibold text-sm">{ann.title}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant={ann.isActive ? 'success' : 'muted'}>{ann.isActive ? 'Active' : 'Inactive'}</Badge>
                    <button onClick={() => handleDelete(ann)} className="text-muted hover:text-red-400 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <p className="text-muted text-sm mt-1">{ann.content}</p>
                <p className="text-muted text-xs mt-2">{formatDateShort(ann.createdAt)}</p>
              </div>
            </Card>
            </FadeIn>
          ))}
        </div>
      )}

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="New Announcement">
        <div className="space-y-4">
          <Input label="Title" placeholder="Announcement title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <Textarea label="Content" placeholder="Announcement message..." value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={4} />
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button fullWidth loading={saving} onClick={handleCreate}>Publish</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
