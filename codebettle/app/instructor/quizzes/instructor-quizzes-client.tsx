'use client';
import { useState } from 'react';
import Link from 'next/link';
import { FileQuestion, Plus, Download, BarChart2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import type { Quiz, Course } from '@/lib/db/types';
import toast from 'react-hot-toast';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'muted'> = {
  published: 'success',
  draft: 'warning',
  archived: 'muted',
};

export default function InstructorQuizzesClient({
  quizzes: initial,
  courses,
}: {
  quizzes: Quiz[];
  courses: Course[];
}) {
  const [quizzes, setQuizzes] = useState(initial);
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    courseId: courses[0]?.id ?? '',
    title: '',
    timeLimitMin: '30',
    attemptsAllowed: '1',
    passMark: '50',
  });

  const handleCreate = async () => {
    if (!form.courseId || !form.title.trim()) {
      toast.error('Pick a course and give the quiz a title');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/instructor/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: form.courseId,
          title: form.title.trim(),
          timeLimitMin: Number(form.timeLimitMin) || undefined,
          attemptsAllowed: Number(form.attemptsAllowed) || 1,
          passMark: Number(form.passMark),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? 'Could not create the quiz');
        return;
      }
      setQuizzes((q) => [body.quiz, ...q]);
      toast.success('Draft quiz created — upload a PDF or add questions');
      setIsOpen(false);
      setForm({ courseId: courses[0]?.id ?? '', title: '', timeLimitMin: '30', attemptsAllowed: '1', passMark: '50' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">Quizzes</h1>
          <p className="text-muted text-sm mt-1">
            Create a quiz, upload a PDF generated with an AI of your choice, review every question, then publish.
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/api/quizzes/sample" download>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" /> Sample PDF template
            </Button>
          </a>
          <Button onClick={() => setIsOpen(true)} disabled={courses.length === 0}>
            <Plus className="w-4 h-4 mr-2" /> New Quiz
          </Button>
        </div>
      </div>

      {courses.length === 0 && (
        <Card className="py-8 text-center">
          <p className="text-white font-semibold mb-2">No courses assigned yet</p>
          <p className="text-muted text-sm">The admin assigns courses to you. Quizzes are created per course.</p>
        </Card>
      )}

      {quizzes.length === 0 ? (
        <Card className="py-16 text-center">
          <FileQuestion className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-white font-semibold mb-2">No quizzes yet</p>
          <p className="text-muted text-sm">
            Download the sample PDF to see the expected format, generate your quiz PDF with any AI tool, then create
            a quiz and upload it.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {quizzes.map((quiz) => (
            <Card key={quiz.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-white font-bold">{quiz.title}</h2>
                  <p className="text-muted text-sm mt-1">
                    {courses.find((c) => c.id === quiz.courseId)?.title ?? 'Course'} ·{' '}
                    {quiz.questions?.length ?? 0} question{(quiz.questions?.length ?? 0) !== 1 ? 's' : ''}
                    {quiz.timeLimitMin ? ` · ${quiz.timeLimitMin} min` : ''}
                    {quiz.attemptsAllowed > 1 ? ` · ${quiz.attemptsAllowed} attempts` : ''}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[quiz.status] ?? 'muted'}>{quiz.status}</Badge>
              </div>
              {quiz.parseWarnings && quiz.parseWarnings.length > 0 && (
                <p className="text-amber-400 text-xs mt-3">
                  {quiz.parseWarnings.length} parse warning{quiz.parseWarnings.length !== 1 ? 's' : ''} — review
                  before publishing.
                </p>
              )}
              <div className="flex gap-2 mt-4">
                <Link href={`/instructor/quizzes/${quiz.id}`}>
                  <Button variant="outline" size="sm">
                    {quiz.status === 'draft' ? 'Review & edit' : 'View'}
                  </Button>
                </Link>
                {quiz.status === 'published' && (
                  <Link href={`/instructor/quizzes/${quiz.id}/analytics`}>
                    <Button variant="outline" size="sm">
                      <BarChart2 className="w-4 h-4 mr-1" /> Analytics
                    </Button>
                  </Link>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="New quiz">
        <div className="space-y-4">
          <Select
            label="Course"
            value={form.courseId}
            onChange={(e) => setForm({ ...form, courseId: e.target.value })}
            options={courses.map((c) => ({ value: c.id, label: c.title }))}
          />
          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Week 1 — HTML basics"
          />
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Time limit (min)"
              type="number"
              min={1}
              value={form.timeLimitMin}
              onChange={(e) => setForm({ ...form, timeLimitMin: e.target.value })}
            />
            <Input
              label="Attempts"
              type="number"
              min={1}
              value={form.attemptsAllowed}
              onChange={(e) => setForm({ ...form, attemptsAllowed: e.target.value })}
            />
            <Input
              label="Pass mark %"
              type="number"
              min={0}
              max={100}
              value={form.passMark}
              onChange={(e) => setForm({ ...form, passMark: e.target.value })}
            />
          </div>
          <p className="text-muted text-xs">
            The quiz starts as a draft. Upload your AI-generated PDF on the next screen, review every parsed question,
            then publish.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating…' : 'Create draft'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
