'use client';
import { useState } from 'react';
import { Bell, Plus, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import { getCoursesByInstructor } from '@/lib/data/courses';
import { announcements as allAnnouncements } from '@/lib/data/announcements';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';

const INSTRUCTOR_ID = 'inst-1';

export default function InstructorAnnouncementsPage() {
  const myCourses = getCoursesByInstructor(INSTRUCTOR_ID);
  const initial = allAnnouncements.filter(a => a.authorId === INSTRUCTOR_ID);
  const [announcements, setAnnouncements] = useState(initial);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', courseId: myCourses[0]?.id || '' });
  const [saving, setSaving] = useState(false);

  const handlePost = async () => {
    if (!form.title.trim() || !form.content.trim()) { toast.error('Title and content required'); return; }
    setSaving(true);
    await new Promise(r => setTimeout(r, 500));
    const ann = { id: Date.now().toString(), ...form, type: 'course' as const, authorId: INSTRUCTOR_ID, createdAt: new Date().toISOString().split('T')[0], isActive: true };
    setAnnouncements(a => [ann, ...a]);
    toast.success('Announcement posted!');
    setIsOpen(false);
    setForm({ title: '', content: '', courseId: myCourses[0]?.id || '' });
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Announcements</h1>
          <p className="text-muted text-sm mt-1">Post updates to your enrolled students</p>
        </div>
        <Button onClick={() => setIsOpen(true)}><Plus className="w-4 h-4" />New Announcement</Button>
      </div>

      {announcements.length === 0 ? (
        <Card className="py-16 text-center">
          <Bell className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-white font-semibold mb-2">No announcements yet</p>
          <p className="text-muted text-sm mb-4">Keep your students informed with course updates.</p>
          <Button size="sm" onClick={() => setIsOpen(true)}><Plus className="w-4 h-4" />Post Announcement</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {announcements.map(ann => {
            const course = myCourses.find(c => c.id === ann.courseId);
            return (
              <Card key={ann.id} hover className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0"><Bell className="w-5 h-5" /></div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-white font-semibold text-sm">{ann.title}</p>
                    <button onClick={() => { setAnnouncements(a => a.filter(a2 => a2.id !== ann.id)); toast.success('Deleted'); }} className="text-muted hover:text-red-400 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  {course && <p className="text-primary text-xs mb-1">{course.title}</p>}
                  <p className="text-muted text-sm">{ann.content}</p>
                  <p className="text-muted text-xs mt-2">{formatDateShort(ann.createdAt)}</p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="New Announcement">
        <div className="space-y-4">
          <Select label="Course" value={form.courseId} onChange={e => setForm(f => ({ ...f, courseId: e.target.value }))} options={myCourses.map(c => ({ value: c.id, label: c.title }))} />
          <Input label="Title" placeholder="Announcement title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <Textarea label="Message" placeholder="Write your announcement..." value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={4} />
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button fullWidth loading={saving} onClick={handlePost}>Post Announcement</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
