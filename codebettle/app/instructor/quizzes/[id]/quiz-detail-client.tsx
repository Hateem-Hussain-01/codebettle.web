'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, BarChart2, Copy, FileText, Plus, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import type { Quiz, QuizQuestion, QuizQuestionType } from '@/lib/db/types';
import {
  QUIZ_AI_PROMPT,
  QUIZ_TEXT_FORMAT_RULES,
  QUIZ_TEXT_IMPORT_SAMPLE,
} from '@/lib/services/quiz-text-format';
import toast from 'react-hot-toast';

const TYPE_LABELS: Record<QuizQuestionType, string> = {
  mcq: 'Multiple choice (one answer)',
  fill_blank: 'Fill in the blank',
  checkbox: 'Checkbox (select all that apply)',
  choose_two: 'Choose Two (exactly 2)',
  choose_three: 'Choose Three (exactly 3)',
};

const TYPE_OPTIONS = (Object.keys(TYPE_LABELS) as QuizQuestionType[]).map((value) => ({
  value,
  label: TYPE_LABELS[value],
}));

interface EditableQuestion {
  type: QuizQuestionType;
  prompt: string;
  points: number;
  topic?: string;
  correctText?: string;
  acceptedAnswers?: string[];
  explanation?: string;
  /** Parser flag, shown as a warning — the teacher cannot set it, and it never blocks publishing. */
  needsReview?: boolean;
  reviewNote?: string;
  options: { text: string; isCorrect?: boolean }[];
}

function toEditable(q: QuizQuestion): EditableQuestion {
  return {
    type: q.type,
    prompt: q.prompt,
    points: q.points,
    topic: q.topic,
    correctText: q.correctText,
    acceptedAnswers: q.acceptedAnswers,
    explanation: q.explanation,
    needsReview: q.needsReview,
    reviewNote: q.reviewNote,
    options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
  };
}

const EMPTY_QUESTION: EditableQuestion = {
  type: 'mcq',
  prompt: '',
  points: 1,
  options: [
    { text: '' },
    { text: '' },
  ],
};

export default function QuizDetailClient({ quiz: initial }: { quiz: Quiz }) {
  const router = useRouter();
  const [quiz, setQuiz] = useState(initial);
  const [questions, setQuestions] = useState<EditableQuestion[]>(initial.questions?.map(toEditable) ?? []);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [meta, setMeta] = useState({
    title: quiz.title,
    description: quiz.description ?? '',
    timeLimitMin: quiz.timeLimitMin?.toString() ?? '',
    attemptsAllowed: quiz.attemptsAllowed.toString(),
    passMark: quiz.passMark?.toString() ?? '',
    scoringPolicy: quiz.scoringPolicy,
    showResultsToStudents: quiz.showResultsToStudents,
    showCorrectAnswers: quiz.showCorrectAnswers,
  });

  const isDraft = quiz.status === 'draft';
  const flaggedCount = questions.filter((q) => q.needsReview).length;

  async function patchQuiz(body: Record<string, unknown>) {
    const res = await fetch(`/api/instructor/quizzes/${quiz.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? 'Could not update the quiz');
      return null;
    }
    setQuiz(data.quiz);
    return data.quiz as Quiz;
  }

  const saveMeta = async () => {
    setSaving(true);
    try {
      const updated = await patchQuiz({
        title: meta.title.trim(),
        description: meta.description.trim() || null,
        timeLimitMin: meta.timeLimitMin ? Number(meta.timeLimitMin) : null,
        attemptsAllowed: Number(meta.attemptsAllowed) || 1,
        passMark: meta.passMark === '' ? null : Number(meta.passMark),
        scoringPolicy: meta.scoringPolicy,
        showResultsToStudents: meta.showResultsToStudents,
        showCorrectAnswers: meta.showCorrectAnswers,
      });
      if (updated) toast.success('Settings saved');
    } finally {
      setSaving(false);
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Could not copy — select the text and copy it manually');
    }
  };

  const handleImportText = async () => {
    if (!importText.trim()) {
      toast.error('Paste the quiz text first');
      return;
    }
    setImporting(true);
    try {
      const res = await fetch(`/api/instructor/quizzes/${quiz.id}/import-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: importText }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Could not import the quiz text');
        return;
      }
      setQuiz(data.quiz);
      setQuestions(data.quiz.questions?.map(toEditable) ?? []);
      setImportText('');
      if (data.parsed.warnings > 0) {
        toast.success(
          `Imported ${data.parsed.questions} questions with ${data.parsed.warnings} warnings — check the flagged questions below.`,
        );
      } else {
        toast.success(`Imported ${data.parsed.questions} questions. Publish when ready.`);
      }
    } finally {
      setImporting(false);
    }
  };

  const saveQuestions = async () => {
    if (questions.some((q) => !q.prompt.trim())) {
      toast.error('Every question needs a prompt');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/instructor/quizzes/${quiz.id}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: questions.map((q) => ({
            type: q.type,
            prompt: q.prompt,
            points: q.points,
            topic: q.topic,
            correctText: q.correctText,
            acceptedAnswers: q.acceptedAnswers,
            explanation: q.explanation,
            options: q.options,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Could not save the questions');
        return;
      }
      setQuiz(data.quiz);
      setQuestions(data.quiz.questions?.map(toEditable) ?? []);
      toast.success('Questions saved');
    } finally {
      setSaving(false);
    }
  };

  const doAction = async (action: 'publish' | 'unpublish' | 'archive') => {
    setSaving(true);
    try {
      const updated = await patchQuiz({ action });
      if (updated) {
        toast.success(action === 'publish' ? 'Quiz published' : `Quiz ${action === 'unpublish' ? 'unpublished' : 'archived'}`);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this draft quiz? This cannot be undone.')) return;
    const res = await fetch(`/api/instructor/quizzes/${quiz.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? 'Could not delete the quiz');
      return;
    }
    toast.success('Quiz deleted');
    router.push('/instructor/quizzes');
  };

  const updateQuestion = (index: number, patch: Partial<EditableQuestion>) => {
    setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  const updateOption = (qi: number, oi: number, patch: Partial<{ text: string; isCorrect?: boolean }>) => {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === qi
          ? { ...q, options: q.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) }
          : q,
      ),
    );
  };

  return (
    <div className="space-y-6">
      <FadeIn className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">{quiz.title}</h1>
          <p className="text-muted text-sm mt-1">
            {questions.length} question{questions.length !== 1 ? 's' : ''}
            {flaggedCount > 0 && ` · ${flaggedCount} flagged — check the notes on those questions`}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant={quiz.status === 'published' ? 'success' : quiz.status === 'draft' ? 'warning' : 'muted'}>
            {quiz.status}
          </Badge>
          {quiz.status === 'published' && (
            <Link href={`/instructor/quizzes/${quiz.id}/analytics`}>
              <Button variant="outline" size="sm">
                <BarChart2 className="w-4 h-4 mr-1" /> Analytics
              </Button>
            </Link>
          )}
        </div>
      </FadeIn>

      {/* Settings */}
      <FadeIn delay={0.05}>
      <Card className="p-5">
        <h2 className="text-white font-bold mb-4">Settings</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Title" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
          <Input
            label="Time limit (minutes, blank = none)"
            type="number"
            min={1}
            value={meta.timeLimitMin}
            onChange={(e) => setMeta({ ...meta, timeLimitMin: e.target.value })}
          />
          <Input
            label="Attempts allowed"
            type="number"
            min={1}
            value={meta.attemptsAllowed}
            onChange={(e) => setMeta({ ...meta, attemptsAllowed: e.target.value })}
          />
          <Input
            label="Pass mark % (blank = none)"
            type="number"
            min={0}
            max={100}
            value={meta.passMark}
            onChange={(e) => setMeta({ ...meta, passMark: e.target.value })}
          />
          <Select
            label="Scoring policy"
            value={meta.scoringPolicy}
            onChange={(e) => setMeta({ ...meta, scoringPolicy: e.target.value as 'exact' | 'partial' })}
            options={[
              { value: 'exact', label: 'Exact — all-or-nothing per question' },
              { value: 'partial', label: 'Partial — proportional credit for multi-select' },
            ]}
          />
          <div className="flex items-center gap-6 pt-6">
            <label className="flex items-center gap-2 text-sm text-white">
              <input
                type="checkbox"
                checked={meta.showResultsToStudents}
                onChange={(e) => setMeta({ ...meta, showResultsToStudents: e.target.checked })}
              />
              Show results to students
            </label>
            <label className="flex items-center gap-2 text-sm text-white">
              <input
                type="checkbox"
                checked={meta.showCorrectAnswers}
                onChange={(e) => setMeta({ ...meta, showCorrectAnswers: e.target.checked })}
              />
              Show correct answers
            </label>
          </div>
        </div>
        <Textarea
          label="Description"
          value={meta.description}
          onChange={(e) => setMeta({ ...meta, description: e.target.value })}
        />
        <div className="flex justify-end mt-4">
          <Button onClick={saveMeta} disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </Card>
      </FadeIn>

      {/* Text import */}
      {isDraft && (
        <FadeIn delay={0.08}>
        <Card className="p-5">
          <h2 className="text-white font-bold mb-2">Import from text</h2>
          <p className="text-muted text-sm mb-4">
            Copy the prompt below, fill in the [BRACKETS], and give it to any AI tool (ChatGPT, Claude, Gemini…).
            Paste the text it gives you into the box below and import it — the quiz is created from that text.
            Anything unclear is flagged below instead of guessed.
          </p>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-semibold text-sm">Ready-made AI prompt</h3>
              <Button variant="outline" size="sm" onClick={() => void copyText(QUIZ_AI_PROMPT, 'Prompt')}>
                <Copy className="w-4 h-4 mr-1" /> Copy prompt
              </Button>
            </div>
            <pre className="text-xs text-muted whitespace-pre-wrap bg-dark-card rounded-lg p-3 max-h-64 overflow-y-auto">
              {QUIZ_AI_PROMPT}
            </pre>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-semibold text-sm">Sample format</h3>
              <Button variant="outline" size="sm" onClick={() => void copyText(QUIZ_TEXT_IMPORT_SAMPLE, 'Sample')}>
                <Copy className="w-4 h-4 mr-1" /> Copy sample
              </Button>
            </div>
            <ul className="text-muted text-sm space-y-1 mb-2">
              {QUIZ_TEXT_FORMAT_RULES.map((rule) => (
                <li key={rule}>• {rule}</li>
              ))}
            </ul>
            <pre className="text-xs text-muted whitespace-pre-wrap bg-dark-card rounded-lg p-3 max-h-64 overflow-y-auto">
              {QUIZ_TEXT_IMPORT_SAMPLE}
            </pre>
          </div>

          <Textarea
            label="Paste the quiz text here"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={'Question 1: What is the capital of France?\nA. London\nB. Paris\nC. Berlin\nD. Madrid\nCorrect Answer: B\nExplanation: Paris is the capital of France.'}
            rows={10}
          />
          <div className="flex justify-end mt-3">
            <Button onClick={() => void handleImportText()} disabled={importing || !importText.trim()}>
              <FileText className="w-4 h-4 mr-2" /> {importing ? 'Importing…' : 'Import quiz text'}
            </Button>
          </div>
          <p className="text-muted text-xs mt-2">
            Importing replaces the questions below with the ones from the pasted text.
          </p>
          {quiz.parseWarnings && quiz.parseWarnings.length > 0 && (
            <div className="mt-4 space-y-1">
              {quiz.parseWarnings.map((w, i) => (
                <p key={i} className="text-amber-400 text-xs flex gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {w.message}
                </p>
              ))}
            </div>
          )}
        </Card>
        </FadeIn>
      )}

      {/* Questions */}
      <FadeIn delay={0.1}>
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold">Questions</h2>
          {isDraft && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuestions((qs) => [...qs, { ...EMPTY_QUESTION, options: [...EMPTY_QUESTION.options] }])}
            >
              <Plus className="w-4 h-4 mr-1" /> Add question
            </Button>
          )}
        </div>
        {questions.length === 0 ? (
          <p className="text-muted text-sm">
            No questions yet. Paste quiz text above, or add a question manually.
          </p>
        ) : (
          <div className="space-y-5">
            {questions.map((q, qi) => (
              <div key={qi} className={`border rounded-xl p-4 ${q.needsReview ? 'border-amber-500/50' : 'border-dark-border'}`}>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className="text-white font-semibold text-sm">Q{qi + 1}</span>
                  <div className="flex items-center gap-2">
                    {q.needsReview && (
                      <Badge variant="warning">Needs attention</Badge>
                    )}
                    {isDraft && (
                      <button
                        type="button"
                        aria-label="Remove question"
                        onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qi))}
                        className="text-muted hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                {q.needsReview && q.reviewNote && (
                  <p className="text-amber-400 text-xs mb-3">{q.reviewNote}</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="md:col-span-3">
                    <Textarea
                      label="Prompt"
                      value={q.prompt}
                      disabled={!isDraft}
                      onChange={(e) => updateQuestion(qi, { prompt: e.target.value })}
                    />
                  </div>
                  <div className="space-y-3">
                    <Select
                      label="Type"
                      value={q.type}
                      disabled={!isDraft}
                      onChange={(e) => updateQuestion(qi, { type: e.target.value as QuizQuestionType })}
                      options={TYPE_OPTIONS}
                    />
                    <Input
                      label="Points"
                      type="number"
                      min={1}
                      value={q.points}
                      disabled={!isDraft}
                      onChange={(e) => updateQuestion(qi, { points: Number(e.target.value) || 1 })}
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <Input
                    label="Explanation (shown to you only, not to students)"
                    value={q.explanation ?? ''}
                    disabled={!isDraft}
                    onChange={(e) => updateQuestion(qi, { explanation: e.target.value })}
                    placeholder="Why is this the correct answer?"
                  />
                </div>

                {q.type === 'fill_blank' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    <Input
                      label="Correct answer"
                      value={q.correctText ?? ''}
                      disabled={!isDraft}
                      onChange={(e) => updateQuestion(qi, { correctText: e.target.value })}
                    />
                    <Input
                      label="Accepted alternates (comma-separated)"
                      value={(q.acceptedAnswers ?? []).join(', ')}
                      disabled={!isDraft}
                      onChange={(e) =>
                        updateQuestion(qi, {
                          acceptedAnswers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                        })
                      }
                    />
                  </div>
                ) : (
                  <div className="space-y-2 mt-3">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <span className="text-muted text-sm w-5">{String.fromCharCode(65 + oi)}.</span>
                        <Input
                          value={opt.text}
                          disabled={!isDraft}
                          onChange={(e) => updateOption(qi, oi, { text: e.target.value })}
                          placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                        />
                        <label className="flex items-center gap-1 text-xs text-white whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={opt.isCorrect ?? false}
                            disabled={!isDraft}
                            onChange={(e) => updateOption(qi, oi, { isCorrect: e.target.checked })}
                          />
                          Correct
                        </label>
                        {isDraft && q.options.length > 2 && (
                          <button
                            type="button"
                            aria-label="Remove option"
                            onClick={() =>
                              updateQuestion(qi, { options: q.options.filter((_, j) => j !== oi) })
                            }
                            className="text-muted hover:text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {isDraft && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateQuestion(qi, { options: [...q.options, { text: '' }] })}
                      >
                        <Plus className="w-4 h-4 mr-1" /> Add option
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {isDraft && questions.length > 0 && (
          <div className="flex justify-end mt-4">
            <Button onClick={saveQuestions} disabled={saving}>
              {saving ? 'Saving…' : 'Save questions'}
            </Button>
          </div>
        )}
      </Card>
      </FadeIn>

      {/* Publish controls */}
      <div className="flex flex-wrap gap-2">
        {isDraft && (
          <Button
            neon
            onClick={() => void doAction('publish')}
            disabled={saving || questions.length === 0}
          >
            Publish quiz
          </Button>
        )}
        {quiz.status === 'published' && (
          <Button variant="outline" onClick={() => void doAction('unpublish')} disabled={saving}>
            Unpublish
          </Button>
        )}
        {quiz.status !== 'archived' && (
          <Button variant="outline" onClick={() => void doAction('archive')} disabled={saving}>
            Archive
          </Button>
        )}
        {isDraft && (
          <Button variant="danger" onClick={() => void handleDelete()} disabled={saving}>
            Delete draft
          </Button>
        )}
      </div>
      {isDraft && questions.length === 0 && (
        <p className="text-muted text-sm">Add at least one question before publishing.</p>
      )}
      {isDraft && flaggedCount > 0 && (
        <p className="text-amber-400 text-sm">
          {flaggedCount} question{flaggedCount !== 1 ? 's' : ''} flagged above — fix the notes before publishing so
          every question can be graded.
        </p>
      )}
    </div>
  );
}
