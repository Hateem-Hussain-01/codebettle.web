'use client';
import { useEffect, useState } from 'react';
import { StickyNote, Plus, Trash2, Edit3, Save, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import FadeIn from '@/components/ui/FadeIn';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Note {
  id: string;
  title: string;
  content: string;
  courseId?: string;
  courseTitle?: string;
  createdAt: string;
}

interface EnrolledCourse {
  id: string;
  title: string;
}

/**
 * Student notes — backed by /api/student/notes (Phase 0d). Notes are
 * the signed-in student's own, persist across reloads, and a note can
 * optionally be linked to one of their enrolled courses.
 */
export default function StudentNotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [courses, setCourses] = useState<EnrolledCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [form, setForm] = useState({ title: '', content: '', courseId: '' });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/student/notes');
        if (!res.ok) throw new Error('Failed to load notes');
        const data = (await res.json()) as { notes: Note[]; courses: EnrolledCourse[] };
        setNotes(data.notes);
        setCourses(data.courses);
      } catch {
        toast.error('Could not load your notes');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openCreate = () => { setEditingNote(null); setForm({ title: '', content: '', courseId: '' }); setIsModalOpen(true); };
  const openEdit = (note: Note) => { setEditingNote(note); setForm({ title: note.title, content: note.content, courseId: note.courseId ?? '' }); setIsModalOpen(true); };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Note title required'); return; }
    const body = { title: form.title.trim(), content: form.content, courseId: form.courseId || undefined };
    try {
      if (editingNote) {
        const res = await fetch(`/api/student/notes/${editingNote.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, courseId: form.courseId || null }),
        });
        if (!res.ok) throw new Error('Failed to update note');
        const data = (await res.json()) as { note: Note };
        const courseTitle = courses.find((c) => c.id === data.note.courseId)?.title;
        setNotes((n) => n.map((note) => (note.id === editingNote.id ? { ...data.note, courseTitle } : note)));
        toast.success('Note updated');
      } else {
        const res = await fetch('/api/student/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Failed to create note');
        const data = (await res.json()) as { note: Note };
        const courseTitle = courses.find((c) => c.id === data.note.courseId)?.title;
        setNotes((n) => [{ ...data.note, courseTitle }, ...n]);
        toast.success('Note created');
      }
      setIsModalOpen(false);
    } catch {
      toast.error('Could not save note');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/student/notes/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete note');
      setNotes((n) => n.filter((note) => note.id !== id));
      toast.success('Note deleted');
    } catch {
      toast.error('Could not delete note');
    }
  };

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">My Notes</h1>
          <p className="text-muted text-sm mt-1">{notes.length} note{notes.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4" />New Note</Button>
      </FadeIn>

      {loading ? (
        <Card className="py-16 text-center">
          <p className="text-muted text-sm">Loading your notes...</p>
        </Card>
      ) : notes.length === 0 ? (
        <Card className="py-16 text-center">
          <StickyNote className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-white font-semibold mb-2">No notes yet</p>
          <p className="text-muted text-sm mb-4">Start creating your learning notes.</p>
          <Button onClick={openCreate} size="sm"><Plus className="w-4 h-4" />Create Note</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {notes.map((note, i) => (
            <FadeIn key={note.id} delay={Math.min(i % 3, 2) * 0.07}>
            <Card hover className="flex flex-col h-full">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-white font-semibold text-sm">{note.title}</h3>
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  <button onClick={() => openEdit(note)} className="text-muted hover:text-primary transition-colors p-1 cursor-pointer"><Edit3 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(note.id)} className="text-muted hover:text-red-400 transition-colors p-1 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {note.courseTitle && <p className="text-xs text-primary mb-2">{note.courseTitle}</p>}
              <p className="text-muted text-xs leading-relaxed flex-1 whitespace-pre-wrap line-clamp-4">{note.content}</p>
              <p className="text-muted text-xs mt-3">{formatDateShort(note.createdAt)}</p>
            </Card>
            </FadeIn>
          ))}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingNote ? 'Edit Note' : 'New Note'}>
        <div className="space-y-4">
          <Input label="Title" placeholder="Note title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <Select
            label="Course (optional)"
            value={form.courseId}
            onChange={e => setForm(f => ({ ...f, courseId: e.target.value }))}
            options={[{ value: '', label: 'No course' }, ...courses.map((c) => ({ value: c.id, label: c.title }))]}
          />
          <Textarea label="Content" placeholder="Write your notes here..." value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={6} />
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} fullWidth><X className="w-4 h-4" />Cancel</Button>
            <Button onClick={handleSave} fullWidth><Save className="w-4 h-4" />Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
