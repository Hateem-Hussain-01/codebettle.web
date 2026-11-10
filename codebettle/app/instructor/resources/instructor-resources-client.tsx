'use client';
import { useState } from 'react';
import { FolderOpen, Plus, Trash2, FileText, Download } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import type { Course } from '@/lib/db/types';
import toast from 'react-hot-toast';

interface Resource { id: string; name: string; courseId: string; type: string; size: string; uploadedAt: string; }

const INITIAL_RESOURCES: Resource[] = [
  { id: '1', name: 'React Hooks Cheatsheet.pdf', courseId: 'course-1', type: 'PDF', size: '1.2 MB', uploadedAt: '2024-04-01' },
  { id: '2', name: 'Project Starter Files.zip', courseId: 'course-1', type: 'ZIP', size: '3.4 MB', uploadedAt: '2024-04-15' },
];

interface InstructorResourcesClientProps {
  courses: Course[];
}

export default function InstructorResourcesClient({ courses: myCourses }: InstructorResourcesClientProps) {
  const [resources, setResources] = useState<Resource[]>(INITIAL_RESOURCES);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ name: '', courseId: myCourses[0]?.id || '', type: 'PDF' });

  const handleAdd = () => {
    if (!form.name.trim()) { toast.error('File name required'); return; }
    const res: Resource = { id: Date.now().toString(), ...form, size: '—', uploadedAt: new Date().toISOString().split('T')[0] };
    setResources(r => [res, ...r]);
    toast.success('Resource added!');
    setIsOpen(false);
    setForm({ name: '', courseId: myCourses[0]?.id || '', type: 'PDF' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Resource Library</h1>
          <p className="text-muted text-sm mt-1">{resources.length} file{resources.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setIsOpen(true)}><Plus className="w-4 h-4" />Add Resource</Button>
      </div>

      {resources.length === 0 ? (
        <Card className="py-16 text-center">
          <FolderOpen className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-white font-semibold mb-2">No resources yet</p>
          <p className="text-muted text-sm mb-4">Upload PDFs, slides, and materials for your students.</p>
          <Button size="sm" onClick={() => setIsOpen(true)}><Plus className="w-4 h-4" />Add Resource</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {resources.map(res => {
            const course = myCourses.find(c => c.id === res.courseId);
            return (
              <Card key={res.id} hover className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-blue-400/10 text-blue-400 flex items-center justify-center flex-shrink-0"><FileText className="w-5 h-5" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">{res.name}</p>
                  <p className="text-muted text-xs">{course?.title} · {res.type} · {res.size}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button className="text-muted hover:text-primary transition-colors cursor-pointer"><Download className="w-4 h-4" /></button>
                  <button onClick={() => { setResources(r => r.filter(r2 => r2.id !== res.id)); toast.success('Deleted'); }} className="text-muted hover:text-red-400 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Add Resource">
        <div className="space-y-4">
          <Select label="Course" value={form.courseId} onChange={e => setForm(f => ({ ...f, courseId: e.target.value }))} options={myCourses.map(c => ({ value: c.id, label: c.title }))} />
          <Input label="File Name" placeholder="e.g., Lecture 1 Slides.pdf" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Select label="Type" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} options={['PDF', 'ZIP', 'Video', 'Image', 'Other'].map(t => ({ value: t, label: t }))} />
          <p className="text-muted text-xs">Note: In production, this would include a file upload field.</p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button fullWidth onClick={handleAdd}>Add Resource</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
