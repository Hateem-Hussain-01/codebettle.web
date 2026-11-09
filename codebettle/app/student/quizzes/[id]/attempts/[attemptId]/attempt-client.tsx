'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import type { StudentQuizAttempt, QuizQuestionType } from '@/lib/db/types';
import type { toPublicQuiz } from '@/lib/db/mappers';
import { requiredSelectionCount } from '@/lib/db/types';
import toast from 'react-hot-toast';

type PublicQuiz = ReturnType<typeof toPublicQuiz>;

interface AnswerState {
  selectedOptionIds: string[];
  textAnswer?: string;
}

interface SubmitResultView {
  score: number | null;
  totalPoints: number | null;
  passed: boolean | null;
  perQuestion?: { questionId: string; isCorrect: boolean | null; pointsAwarded: number }[];
  correctAnswers?: { questionId: string; correctOptionIds?: string[]; correctText?: string }[];
}

function formatRemaining(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export default function AttemptClient({
  attempt,
  quiz,
  serverNow,
}: {
  attempt: StudentQuizAttempt;
  quiz: PublicQuiz;
  serverNow: string;
}) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() => {
    const initial: Record<string, AnswerState> = {};
    for (const a of attempt.answers ?? []) {
      initial[a.questionId] = { selectedOptionIds: a.selectedOptionIds, textAnswer: a.textAnswer };
    }
    return initial;
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResultView | null>(null);
  const submittedRef = useRef(false);

  // Server clock offset, so the timer is based on the server deadline.
  const offsetRef = useRef(Date.now() - new Date(serverNow).getTime());
  const dueAtMs = attempt.dueAt ? new Date(attempt.dueAt).getTime() : null;
  const [remaining, setRemaining] = useState<number | null>(() =>
    dueAtMs === null ? null : Math.max(0, Math.floor((dueAtMs - (Date.now() - offsetRef.current)) / 1000)),
  );

  const submit = useCallback(async () => {
    if (submittedRef.current || submitting) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const payload = quiz.questions.map((q) => ({
        questionId: q.id,
        selectedOptionIds: answers[q.id]?.selectedOptionIds ?? [],
        textAnswer: answers[q.id]?.textAnswer,
      }));
      const res = await fetch(`/api/student/quizzes/${quiz.id}/attempts/${attempt.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        submittedRef.current = false;
        toast.error(data.error ?? 'Could not submit the quiz');
        return;
      }
      setResult(data.result);
    } finally {
      setSubmitting(false);
    }
  }, [answers, attempt.id, quiz, submitting]);

  // Tick the timer; auto-submit at zero.
  useEffect(() => {
    if (dueAtMs === null) return;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.floor((dueAtMs - (Date.now() - offsetRef.current)) / 1000));
      setRemaining(left);
      if (left <= 0) {
        clearInterval(timer);
        toast('Time is up — submitting your answers');
        void submit();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [dueAtMs, submit]);

  const questions = quiz.questions;
  const question = questions[current];

  const isAnswered = useCallback(
    (qId: string) => {
      const a = answers[qId];
      if (!a) return false;
      return a.selectedOptionIds.length > 0 || (a.textAnswer?.trim().length ?? 0) > 0;
    },
    [answers],
  );

  const answeredCount = useMemo(() => questions.filter((q) => isAnswered(q.id)).length, [questions, isAnswered]);

  const toggleOption = (qId: string, optionId: string, type: string) => {
    setAnswers((prev) => {
      const currentAnswer = prev[qId] ?? { selectedOptionIds: [] };
      if (type === 'mcq') {
        return { ...prev, [qId]: { selectedOptionIds: [optionId] } };
      }
      const required = requiredSelectionCount(type as QuizQuestionType);
      const selected = currentAnswer.selectedOptionIds;
      if (selected.includes(optionId)) {
        return { ...prev, [qId]: { ...currentAnswer, selectedOptionIds: selected.filter((id) => id !== optionId) } };
      }
      if (required !== null && selected.length >= required) return prev; // exact-count cap
      return { ...prev, [qId]: { ...currentAnswer, selectedOptionIds: [...selected, optionId] } };
    });
  };

  if (result) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <Card className="p-6 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <h1 className="text-2xl font-black text-white">Quiz submitted</h1>
          {result.score === null ? (
            <p className="text-muted text-sm mt-2">
              Your answers are in. The teacher has chosen not to show scores here — check back later.
            </p>
          ) : (
            <>
              <p className="text-white text-xl font-bold mt-3">
                {result.score} / {result.totalPoints}
              </p>
              {result.passed !== null && (
                <p className="mt-2">
                  <Badge variant={result.passed ? 'success' : 'muted'}>
                    {result.passed ? 'Passed' : 'Not passed'}
                  </Badge>
                </p>
              )}
            </>
          )}
        </Card>
        {result.perQuestion && (
          <Card className="p-5">
            <h2 className="text-white font-bold mb-3">Your answers</h2>
            <div className="space-y-3">
              {questions.map((q, i) => {
                const pq = result.perQuestion!.find((p) => p.questionId === q.id);
                const correct = result.correctAnswers?.find((c) => c.questionId === q.id);
                return (
                  <div key={q.id} className="border-b border-dark-border/50 pb-3 last:border-0">
                    <p className="text-white text-sm flex items-start gap-2">
                      {pq?.isCorrect === true ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                      ) : pq?.isCorrect === false ? (
                        <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      ) : null}
                      <span>
                        Q{i + 1}. {q.prompt}
                      </span>
                    </p>
                    <p className="text-muted text-xs mt-1 ml-6">
                      {pq ? `${pq.pointsAwarded} / ${q.points} point${q.points !== 1 ? 's' : ''}` : ''}
                    </p>
                    {correct && q.type === 'fill_blank' && correct.correctText && (
                      <p className="text-muted text-xs mt-1 ml-6">Correct answer: {correct.correctText}</p>
                    )}
                    {correct && correct.correctOptionIds && (
                      <p className="text-muted text-xs mt-1 ml-6">
                        Correct:{' '}
                        {q.options
                          .filter((o) => correct.correctOptionIds!.includes(o.id))
                          .map((o) => o.text)
                          .join(', ')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    );
  }

  if (!question) {
    return <p className="text-muted">This quiz has no questions.</p>;
  }

  const required = requiredSelectionCount(question.type);
  const selected = answers[question.id]?.selectedOptionIds ?? [];
  const isLast = current === questions.length - 1;
  const lowTime = remaining !== null && remaining <= 60;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">{quiz.title}</h1>
          <p className="text-muted text-sm mt-1">
            Question {current + 1} of {questions.length} · {answeredCount} answered
          </p>
        </div>
        {remaining !== null && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${lowTime ? 'border-red-500 text-red-400' : 'border-dark-border text-white'}`}>
            <Clock className="w-4 h-4" />
            <span className="font-mono font-bold">{formatRemaining(remaining)}</span>
            <span className="text-xs text-muted">left</span>
          </div>
        )}
      </div>

      {/* Question navigation */}
      <div className="flex flex-wrap gap-2">
        {questions.map((q, i) => (
          <button
            key={q.id}
            type="button"
            onClick={() => setCurrent(i)}
            className={`w-9 h-9 rounded-lg text-sm font-bold border ${
              i === current
                ? 'bg-primary text-white border-primary'
                : isAnswered(q.id)
                  ? 'bg-green-500/20 text-green-300 border-green-500/40'
                  : 'bg-dark-card text-muted border-dark-border'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-white font-semibold">
            Q{current + 1}. {question.prompt}
          </h2>
          <Badge variant="muted">
            {question.points} pt{question.points !== 1 ? 's' : ''}
          </Badge>
        </div>
        {required !== null && (
          <p className="text-muted text-xs mt-2">
            Select exactly {required} option{required !== 1 ? 's' : ''} ({selected.length} selected).
          </p>
        )}
        {question.type === 'fill_blank' ? (
          <div className="mt-4">
            <Input
              placeholder="Type your answer"
              value={answers[question.id]?.textAnswer ?? ''}
              onChange={(e) =>
                setAnswers((prev) => ({
                  ...prev,
                  [question.id]: { selectedOptionIds: [], textAnswer: e.target.value },
                }))
              }
            />
          </div>
        ) : (
          <div className="space-y-2 mt-4">
            {question.options.map((opt) => {
              const checked = selected.includes(opt.id);
              const disabled =
                !checked && required !== null && selected.length >= required && question.type !== 'mcq';
              return (
                <label
                  key={opt.id}
                  className={`flex items-center gap-3 border rounded-lg px-3 py-2.5 cursor-pointer ${
                    checked ? 'border-primary bg-primary/10' : 'border-dark-border'
                  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <input
                    type={question.type === 'mcq' ? 'radio' : 'checkbox'}
                    name={`q-${question.id}`}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleOption(question.id, opt.id, question.type)}
                  />
                  <span className="text-white text-sm">{opt.text}</span>
                </label>
              );
            })}
          </div>
        )}
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}>
          Previous
        </Button>
        {isLast ? (
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit quiz'}
          </Button>
        ) : (
          <Button onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}>Next</Button>
        )}
      </div>
      <p className="text-muted text-xs text-center">
        Your answers are saved when you submit. If the timer runs out, the quiz submits automatically.
      </p>
    </div>
  );
}
