'use client';
import { useRef, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import FadeIn from '@/components/ui/FadeIn';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { BookOpen, Plus, Trash2, ChevronUp, ChevronDown, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Lesson, Module } from '@/lib/db/types';

interface CourseCurriculumClientProps {
  courseId: string;
  modules: Module[];
}

type DeleteTarget =
  | { kind: 'module'; moduleId: string; title: string }
  | { kind: 'lesson'; moduleId: string; lessonId: string; title: string }
  | null;

async function api(path: string, method: string, body?: Record<string, unknown>): Promise<{ ok: boolean; data: any }> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function cloneModules(modules: Module[]): Module[] {
  return modules.map(m => ({ ...m, lessons: m.lessons.map(l => ({ ...l })) }));
}

/**
 * Admin curriculum manager — the course detail page's interactive half.
 * Modules/lessons are created, renamed, reordered (PATCH {position}),
 * edited and deleted through /api/admin/courses/[id]/modules/... .
 * Local edits are staged in state; each action saves through the API
 * immediately and only updates the list on success.
 */
export default function CourseCurriculumClient({ courseId, modules: initialModules }: CourseCurriculumClientProps) {
  const [modules, setModules] = useState<Module[]>(() => cloneModules(initialModules));
  // Last server-confirmed state, used to send only changed lesson fields.
  const savedRef = useRef<Module[]>(cloneModules(initialModules));
  const [openModules, setOpenModules] = useState<Record<string, boolean>>(
    Object.fromEntries(initialModules.map(m => [m.id, true])),
  );
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [newLessonTitle, setNewLessonTitle] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [saving, setSaving] = useState(false);

  const base = `/api/admin/courses/${courseId}`;

  const addModule = async () => {
    const title = newModuleTitle.trim();
    if (!title) { toast.error('Module title is required'); return; }
    setSaving(true);
    try {
      const { ok, data } = await api(`${base}/modules`, 'POST', { title });
      if (!ok) { toast.error(data.error || 'Could not add module'); return; }
      const module = data.module as Module;
      setModules(ms => [...ms, { ...module, lessons: [] }]);
      savedRef.current = [...savedRef.current, { ...module, lessons: [] }];
      setOpenModules(o => ({ ...o, [module.id]: true }));
      setNewModuleTitle('');
      toast.success('Module added');
    } finally {
      setSaving(false);
    }
  };

  const renameModule = async (moduleId: string) => {
    const mod = modules.find(m => m.id === moduleId);
    const saved = savedRef.current.find(m => m.id === moduleId);
    if (!mod || !mod.title.trim()) { toast.error('Module title is required'); return; }
    if (saved && saved.title === mod.title) return;
    const { ok, data } = await api(`${base}/modules/${moduleId}`, 'PATCH', { title: mod.title });
    if (!ok) { toast.error(data.error || 'Could not rename module'); return; }
    savedRef.current = savedRef.current.map(m => m.id === moduleId ? { ...m, title: mod.title } : m);
    toast.success('Module renamed');
  };

  const moveModule = async (moduleId: string, dir: -1 | 1) => {
    const idx = modules.findIndex(m => m.id === moduleId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= modules.length) return;
    const { ok, data } = await api(`${base}/modules/${moduleId}`, 'PATCH', { position: target + 1 });
    if (!ok) { toast.error(data.error || 'Could not reorder module'); return; }
    setModules(ms => {
      const next = [...ms];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
    savedRef.current = (() => {
      const next = [...savedRef.current];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    })();
    toast.success('Module moved');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'module') {
      const { ok, data } = await api(`${base}/modules/${deleteTarget.moduleId}`, 'DELETE');
      if (!ok) { toast.error(data.error || 'Could not delete module'); return; }
      setModules(ms => ms.filter(m => m.id !== deleteTarget.moduleId));
      savedRef.current = savedRef.current.filter(m => m.id !== deleteTarget.moduleId);
      toast.success('Module deleted');
    } else {
      const { ok, data } = await api(
        `${base}/modules/${deleteTarget.moduleId}/lessons/${deleteTarget.lessonId}`,
        'DELETE',
      );
      if (!ok) { toast.error(data.error || 'Could not delete lesson'); return; }
      setModules(ms => ms.map(m => m.id === deleteTarget.moduleId
        ? { ...m, lessons: m.lessons.filter(l => l.id !== deleteTarget.lessonId) }
        : m));
      savedRef.current = savedRef.current.map(m => m.id === deleteTarget.moduleId
        ? { ...m, lessons: m.lessons.filter(l => l.id !== deleteTarget.lessonId) }
        : m);
      toast.success('Lesson deleted');
    }
    setDeleteTarget(null);
  };

  const addLesson = async (moduleId: string) => {
    const title = (newLessonTitle[moduleId] || '').trim();
    if (!title) { toast.error('Lesson title is required'); return; }
    setSaving(true);
    try {
      const { ok, data } = await api(`${base}/modules/${moduleId}/lessons`, 'POST', { title });
      if (!ok) { toast.error(data.error || 'Could not add lesson'); return; }
      const lesson = data.lesson as Lesson;
      setModules(ms => ms.map(m => m.id === moduleId ? { ...m, lessons: [...m.lessons, lesson] } : m));
      savedRef.current = savedRef.current.map(m => m.id === moduleId ? { ...m, lessons: [...m.lessons, lesson] } : m);
      setNewLessonTitle(t => ({ ...t, [moduleId]: '' }));
      toast.success('Lesson added');
    } finally {
      setSaving(false);
    }
  };

  const updateLessonField = (moduleId: string, lessonId: string, field: keyof Lesson, value: string) =>
    setModules(ms => ms.map(m => m.id === moduleId
      ? { ...m, lessons: m.lessons.map(l => l.id === lessonId ? { ...l, [field]: value } : l) }
      : m));

  const saveLesson = async (moduleId: string, lessonId: string) => {
    const mod = modules.find(m => m.id === moduleId);
    const lesson = mod?.lessons.find(l => l.id === lessonId);
    const saved = savedRef.current.find(m => m.id === moduleId)?.lessons.find(l => l.id === lessonId);
    if (!lesson || !lesson.title.trim()) { toast.error('Lesson title is required'); return; }
    if (!saved) return;
    const patch: Record<string, unknown> = {};
    if (lesson.title !== saved.title) patch.title = lesson.title;
    if (lesson.description !== saved.description) patch.description = lesson.description;
    if (lesson.driveRecordingUrl !== saved.driveRecordingUrl) patch.recordingUrl = lesson.driveRecordingUrl || null;
    if (lesson.duration !== saved.duration) patch.duration = lesson.duration || null;
    if (lesson.date !== saved.date) patch.date = lesson.date || null;
    if (Object.keys(patch).length === 0) return;
    const { ok, data } = await api(`${base}/modules/${moduleId}/lessons/${lessonId}`, 'PATCH', patch);
    if (!ok) { toast.error(data.error || 'Could not save lesson'); return; }
    const updated = data.lesson as Lesson;
    setModules(ms => ms.map(m => m.id === moduleId
      ? { ...m, lessons: m.lessons.map(l => l.id === lessonId ? updated : l) }
      : m));
    savedRef.current = savedRef.current.map(m => m.id === moduleId
      ? { ...m, lessons: m.lessons.map(l => l.id === lessonId ? updated : l) }
      : m);
    toast.success('Lesson saved');
  };

  const moveLesson = async (moduleId: string, lessonId: string, dir: -1 | 1) => {
    const mod = modules.find(m => m.id === moduleId);
    if (!mod) return;
    const idx = mod.lessons.findIndex(l => l.id === lessonId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= mod.lessons.length) return;
    const { ok, data } = await api(`${base}/modules/${moduleId}/lessons/${lessonId}`, 'PATCH', { position: target + 1 });
    if (!ok) { toast.error(data.error || 'Could not reorder lesson'); return; }
    const reorder = (ms: Module[]) => ms.map(m => {
      if (m.id !== moduleId) return m;
      const lessons = [...m.lessons];
      [lessons[idx], lessons[target]] = [lessons[target], lessons[idx]];
      return { ...m, lessons };
    });
    setModules(reorder);
    savedRef.current = reorder(savedRef.current);
    toast.success('Lesson moved');
  };

  return (
    <FadeIn>
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-bold text-sm flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary" />Manage Curriculum</h2>
        <span className="text-muted text-xs">{modules.length} module{modules.length !== 1 ? 's' : ''} · {modules.reduce((a, m) => a + m.lessons.length, 0)} lessons</span>
      </div>

      {modules.length === 0 && (
        <p className="text-muted text-sm text-center py-6">No curriculum yet — add the first module below.</p>
      )}

      <div className="space-y-4">
        {modules.map((mod, mi) => (
          <div key={mod.id} className="border border-dark-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-dark-border/30">
              <button onClick={() => setOpenModules(o => ({ ...o, [mod.id]: !o[mod.id] }))} className="text-muted cursor-pointer">
                {openModules[mod.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <Input
                value={mod.title}
                onChange={e => setModules(ms => ms.map(m => m.id === mod.id ? { ...m, title: e.target.value } : m))}
                placeholder={`Module ${mi + 1}`}
                className="flex-1 text-sm"
              />
              <button onClick={() => moveModule(mod.id, -1)} disabled={mi === 0} title="Move up" className="text-muted hover:text-white disabled:opacity-30 cursor-pointer p-1"><ChevronUp className="w-4 h-4" /></button>
              <button onClick={() => moveModule(mod.id, 1)} disabled={mi === modules.length - 1} title="Move down" className="text-muted hover:text-white disabled:opacity-30 cursor-pointer p-1"><ChevronDown className="w-4 h-4" /></button>
              <Button size="sm" variant="secondary" onClick={() => renameModule(mod.id)}><Save className="w-3.5 h-3.5" />Save</Button>
              <button onClick={() => setDeleteTarget({ kind: 'module', moduleId: mod.id, title: mod.title })} title="Delete module" className="text-muted hover:text-red-400 cursor-pointer p-1"><Trash2 className="w-4 h-4" /></button>
            </div>

            {openModules[mod.id] && (
              <div className="p-4 space-y-3">
                {mod.lessons.map((lesson, li) => (
                  <div key={lesson.id} className="bg-dark-border/20 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-primary text-xs font-semibold flex-shrink-0">Class {li + 1}</span>
                      <button onClick={() => moveLesson(mod.id, lesson.id, -1)} disabled={li === 0} title="Move up" className="text-muted hover:text-white disabled:opacity-30 cursor-pointer p-1"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => moveLesson(mod.id, lesson.id, 1)} disabled={li === mod.lessons.length - 1} title="Move down" className="text-muted hover:text-white disabled:opacity-30 cursor-pointer p-1"><ChevronDown className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteTarget({ kind: 'lesson', moduleId: mod.id, lessonId: lesson.id, title: lesson.title })} title="Delete lesson" className="ml-auto text-muted hover:text-red-400 cursor-pointer p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-2">
                      <Input value={lesson.title} onChange={e => updateLessonField(mod.id, lesson.id, 'title', e.target.value)} placeholder="Class title" />
                      <Input type="date" value={lesson.date || ''} onChange={e => updateLessonField(mod.id, lesson.id, 'date', e.target.value)} />
                      <Input value={lesson.duration} onChange={e => updateLessonField(mod.id, lesson.id, 'duration', e.target.value)} placeholder="e.g. 1h 30min" />
                    </div>
                    <Input value={lesson.description} onChange={e => updateLessonField(mod.id, lesson.id, 'description', e.target.value)} placeholder="Topics covered in this class" />
                    <div className="flex gap-2">
                      <Input value={lesson.driveRecordingUrl} onChange={e => updateLessonField(mod.id, lesson.id, 'driveRecordingUrl', e.target.value)} placeholder="Recording URL (https://drive.google.com/...)" className="flex-1 text-xs" />
                      <Button size="sm" variant="secondary" onClick={() => saveLesson(mod.id, lesson.id)}><Save className="w-3.5 h-3.5" />Save</Button>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={newLessonTitle[mod.id] || ''}
                    onChange={e => setNewLessonTitle(t => ({ ...t, [mod.id]: e.target.value }))}
                    placeholder="New lesson title"
                    className="flex-1 text-sm"
                  />
                  <Button size="sm" variant="secondary" onClick={() => addLesson(mod.id)} loading={saving}><Plus className="w-3.5 h-3.5" />Add Lesson</Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-4">
        <Input value={newModuleTitle} onChange={e => setNewModuleTitle(e.target.value)} placeholder="New module title" className="flex-1 text-sm" />
        <Button size="sm" onClick={addModule} loading={saving}><Plus className="w-3.5 h-3.5" />Add Module</Button>
      </div>

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={deleteTarget?.kind === 'module' ? 'Delete Module' : 'Delete Lesson'} size="sm">
        <p className="text-muted text-sm mb-6">
          Are you sure you want to delete “{deleteTarget?.title}”?
          {deleteTarget?.kind === 'module' ? ' Its lessons will be deleted too.' : ''} This cannot be undone.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" fullWidth onClick={confirmDelete}>Delete</Button>
        </div>
      </Modal>
    </Card>
    </FadeIn>
  );
}
