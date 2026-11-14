'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import type { Assignment } from '@/lib/db/types';
import type { Batch } from '@/lib/db/types';
import type { Course } from '@/lib/db/types';
import { AlertTriangle, ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react';

/**
 * Instructor > Assignments — create, edit and delete assignments for
 * the teacher's own courses (optionally one batch), and open each
 * assignment to grade its Colab link submissions.
 *
 * Submissions are Google Colab LINKS only — students never upload a
 * file, so this feature uses (nearly) no storage.
 */

interface CourseWithBatches extends Course {
  batches: Batch[];
}

interface ListResponse {
  assignments: Assignment[];
  courses: CourseWithBatches[];
  tablesReady: boolean;
  error?: string;
}

const EMPTY_FORM = {
  title: '',
  description: '',
  courseId: '',
  batchId: '',
  dueDate: '',
  maxMarks: '',
};

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as { error?: string };
    return json.error ?? fallback;
  } catch {
    return fallback;
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'No due date';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No due date';
  return d.toLocaleString();
}

export default function InstructorAssignmentsClient() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [courses, setCourses] = useState<CourseWithBatches[]>([]);
  const [tablesReady, setTablesReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/instructor/assignments');
      const json = (await res.json()) as ListResponse;
      if (!res.ok) {
        setError(json.error ?? 'Could not load assignments');
        return;
      }
      setAssignments(json.assignments);
      setCourses(json.courses);
      setTablesReady(json.tablesReady);
    } catch {
      setError('Could not load assignments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedCourse = courses.find((c) => c.id === form.courseId);
  const batches = selectedCourse?.batches ?? [];

  async function save() {
    setBusy(true);
    setNotice('');
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      courseId: form.courseId,
      batchId: form.batchId || null,
      dueDate: form.dueDate || null,
      maxMarks: Number(form.maxMarks),
    };
    try {
      const res = await fetch(
        editingId ? `/api/instructor/assignments/${editingId}` : '/api/instructor/assignments',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        setNotice(await readError(res, 'Could not save the assignment'));
        return;
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      setNotice(editingId ? 'Assignment updated.' : 'Assignment created.');
      await load();
    } catch {
      setNotice('Could not save the assignment');
    } finally {
      setBusy(false);
    }
  }

  async function remove(assignment: Assignment) {
    if (!window.confirm(`Delete the assignment “${assignment.title}” and all its submissions?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/instructor/assignments/${assignment.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setNotice(await readError(res, 'Could not delete the assignment'));
        return;
      }
      setNotice('Assignment deleted.');
      await load();
    } catch {
      setNotice('Could not delete the assignment');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(a: Assignment) {
    setEditingId(a.id);
    setForm({
      title: a.title,
      description: a.description,
      courseId: a.courseId,
      batchId: a.batchId ?? '',
      dueDate: a.dueDate ? new Date(a.dueDate).toISOString().slice(0, 16) : '',
      maxMarks: String(a.maxMarks),
    });
    setShowForm(true);
    setNotice('');
  }

  if (loading) return <p className="text-muted text-sm">Loading assignments…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground">Assignments</h1>
          <p className="text-muted text-sm mt-1">
            Set assignments for your courses. Students submit a Google Colab link — no files, no uploads.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setEditingId(null);
            setForm(EMPTY_FORM);
            setShowForm((s) => !s);
            setNotice('');
          }}
        >
          <Plus className="w-4 h-4" /> New assignment
        </Button>
      </div>

      {!tablesReady && (
        <Card className="p-4 flex items-start gap-3 border-yellow-500/40">
          <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-sm text-foreground/80">
            Assignments are not set up yet — run <code className="font-mono">codebettle-assignments-migration.sql</code> in
            the Supabase SQL Editor first.
          </p>
        </Card>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {notice && <p className="text-sm text-primary-text">{notice}</p>}

      {showForm && (
        <Card className="p-5 space-y-4">
          <h2 className="font-bold text-foreground">{editingId ? 'Edit assignment' : 'New assignment'}</h2>
          <Input label="Title *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Build a spam classifier" />
          <Textarea
            label="Description *"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={4}
            placeholder="What should the student build? What will you check in the notebook?"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Course *"
              value={form.courseId}
              onChange={(e) => setForm({ ...form, courseId: e.target.value, batchId: '' })}
              options={[
                { value: '', label: 'Select a course…' },
                ...courses.map((c) => ({ value: c.id, label: c.title })),
              ]}
            />
            <Select
              label="Batch (optional — whole course when empty)"
              value={form.batchId}
              onChange={(e) => setForm({ ...form, batchId: e.target.value })}
              options={[
                { value: '', label: 'Whole course' },
                ...batches.map((b) => ({ value: b.id, label: `BATCH-${b.batchNumber}` })),
              ]}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Due date (optional)"
              type="datetime-local"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
            <Input
              label="Max marks *"
              type="number"
              min={1}
              max={1000}
              value={form.maxMarks}
              onChange={(e) => setForm({ ...form, maxMarks: e.target.value })}
              placeholder="e.g. 100"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" loading={busy} onClick={() => void save()}>
              {editingId ? 'Save changes' : 'Create assignment'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {assignments.length === 0 ? (
        <Card className="py-16 text-center">
          <ClipboardList className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-foreground font-semibold mb-2">No assignments yet</p>
          <p className="text-muted text-sm">Create your first assignment above — students submit a Colab link.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {assignments.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/instructor/assignments/${a.id}`}
                    className="font-bold text-foreground hover:text-primary-text"
                  >
                    {a.title}
                  </Link>
                  <p className="text-xs text-muted mt-1">
                    {a.courseTitle ?? 'Course'}
                    {a.batchLabel ? ` · ${a.batchLabel}` : ' · Whole course'} · Max {a.maxMarks} marks ·{' '}
                    {formatDateTime(a.dueDate)}
                  </p>
                  <p className="text-sm text-foreground/80 mt-2 line-clamp-2">{a.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="info">
                    {a.submissionCount ?? 0} submitted
                  </Badge>
                  <Badge variant={(a.gradedCount ?? 0) === (a.submissionCount ?? 0) && (a.submissionCount ?? 0) > 0 ? 'success' : 'muted'}>
                    {a.gradedCount ?? 0} graded
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Link href={`/instructor/assignments/${a.id}`}>
                  <Button variant="secondary" size="sm">
                    View submissions
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={() => startEdit(a)} aria-label="Edit">
                  <Pencil className="w-4 h-4" /> Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void remove(a)} aria-label="Delete">
                  <Trash2 className="w-4 h-4 text-red-400" /> Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
