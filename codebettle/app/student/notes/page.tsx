'use client';
import { useState } from 'react';
import { StickyNote, Plus, Trash2, Edit3, Save, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import FadeIn from '@/components/ui/FadeIn';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Note {
  id: string;
  title: string;
  content: string;
  courseTitle: string;
  createdAt: string;
}

const INITIAL_NOTES: Note[] = [
  { id: '1', title: 'React Hooks Summary', content: 'useState: local state\nuseEffect: side effects\nuseContext: shared state\nuseReducer: complex state', courseTitle: 'Complete React & Next.js Mastery', createdAt: '2024-04-01' },
  { id: '2', title: 'NumPy Array Operations', content: 'np.array() - create array\nnp.zeros() - zeros array\nnp.reshape() - change shape\nnp.dot() - dot product', courseTitle: 'Python for Data Science & ML', createdAt: '2024-04-15' },
];

export default function StudentNotesPage() {
  const [notes, setNotes] = useState<Note[]>(INITIAL_NOTES);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [form, setForm] = useState({ title: '', content: '', courseTitle: '' });

  const openCreate = () => { setEditingNote(null); setForm({ title: '', content: '', courseTitle: '' }); setIsModalOpen(true); };
  const openEdit = (note: Note) => { setEditingNote(note); setForm({ title: note.title, content: note.content, courseTitle: note.courseTitle }); setIsModalOpen(true); };

  const handleSave = () => {
    if (!form.title.trim()) { toast.error('Note title required'); return; }
    if (editingNote) {
      setNotes(n => n.map(note => note.id === editingNote.id ? { ...note, ...form } : note));
      toast.success('Note updated');
    } else {
      const newNote: Note = { id: Date.now().toString(), ...form, createdAt: new Date().toISOString().split('T')[0] };
      setNotes(n => [newNote, ...n]);
      toast.success('Note created');
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    setNotes(n => n.filter(note => note.id !== id));
    toast.success('Note deleted');
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

      {notes.length === 0 ? (
        <Card className="py-16 text-center">
          <StickyNote className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-white font-semibold mb-2">No notes yet</p>
          <p className="text-muted text-sm mb-4">Create notes to help you remember key concepts.</p>
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
              <p className="text-xs text-primary mb-2">{note.courseTitle}</p>
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
          <Input label="Course" placeholder="Course name (optional)" value={form.courseTitle} onChange={e => setForm(f => ({ ...f, courseTitle: e.target.value }))} />
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
