'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import { Bell, Plus, Trash2 } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { Announcement, Course } from '@/lib/db/types';

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
  // Phase 3 (Worker B) — course announcements. The list above stays
  // site-wide only (as before); a course announcement is posted to the
  // course's enrolled students and confirmed by toast, not added here.
  const [scope, setScope] = useState<'site-wide' | 'course'>('site-wide');
  const [courseId, setCourseId] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoaded, setCoursesLoaded] = useState(false);

  // Course list comes from the existing admin courses API (same
  // pattern as the instructor announcements course selector, which
  // gets its courses server-side). Loaded lazily on first modal open.
  // A 403 (admin without the `courses` area) falls back to site-wide.
  const openCreate = async () => {
    setIsOpen(true);
    if (coursesLoaded) return;
    try {
      const res = await fetch('/api/admin/courses?limit=100');
      if (!res.ok) throw new Error(`Course list failed (${res.status})`);
      const data = await res.json();
      const items: Course[] = Array.isArray(data.courses) ? data.courses : [];
      setCourses(items);
      if (items[0]) setCourseId(items[0].id);
    } catch {
      toast.error('Could not load courses — site-wide only for now');
    } finally {
      setCoursesLoaded(true);
    }
  };

  const handleCreate = async () => {
    if (!form.title.trim() || !form.content.trim()) { toast.error('Title and content required'); return; }
    if (scope === 'course' && !courseId) { toast.error('Choose a course for this announcement'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          content: form.content,
          type: scope,
          ...(scope === 'course' ? { courseId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not publish the announcement');
        return;
      }
      if (scope === 'site-wide') {
        setList(l => [data.announcement as Ann, ...l]);
        toast.success('Announcement published!');
      } else {
        const course = courses.find(c => c.id === courseId);
        toast.success(`Course announcement published to ${course ? course.title : 'the course'}!`);
      }
      setIsOpen(false);
      setForm({ title: '', content: '' });
      setScope('site-wide');
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
          <h1 className="text-2xl font-black text-foreground">Announcements</h1>
          <p className="text-muted text-sm mt-1">Site-wide announcements visible to all users</p>
        </div>
        <Button onClick={() => void openCreate()}><Plus className="w-4 h-4" />New Announcement</Button>
      </FadeIn>

      {list.length === 0 ? (
        <Card className="py-16 text-center">
          <Bell className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-foreground font-semibold mb-2">No announcements</p>
          <Button size="sm" onClick={() => void openCreate()}>Create First Announcement</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((ann, i) => (
            <FadeIn key={ann.id} delay={Math.min(i, 4) * 0.05}>
            <Card hover className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary-text flex items-center justify-center flex-shrink-0"><Bell className="w-5 h-5" /></div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-foreground font-semibold text-sm">{ann.title}</p>
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
          <Select
            label="Audience"
            value={scope}
            onChange={e => setScope(e.target.value as 'site-wide' | 'course')}
            options={[
              { value: 'site-wide', label: 'Site-wide (all users)' },
              { value: 'course', label: 'Specific course' },
            ]}
          />
          {scope === 'course' && (
            <Select
              label="Course"
              value={courseId}
              onChange={e => setCourseId(e.target.value)}
              options={courses.map(c => ({ value: c.id, label: c.title }))}
            />
          )}
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
