'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import type { Assignment, AssignmentSubmission } from '@/lib/db/types';
import { ArrowLeft, Clock, ExternalLink, FileText } from 'lucide-react';

/**
 * Shared assignment detail (submissions + grading), used by the
 * instructor portal and the admin Assignments section. The `apiBase`
 * prop selects the API (/api/instructor or /api/admin); grading goes
 * through the shared /api/instructor/submissions/[id]/grade endpoint,
 * which accepts teachers (own courses) and admins.
 *
 * Submissions are Google Colab LINKS only — the teacher opens the
 * link to review the student's notebook. There is no file download.
 */

interface DetailResponse {
  assignment: Assignment;
  submissions: AssignmentSubmission[];
  error?: string;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as { error?: string };
    return json.error ?? fallback;
  } catch {
    return fallback;
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export default function AssignmentDetailClient({
  assignmentId,
  apiBase,
  backHref,
}: {
  assignmentId: string;
  apiBase: string;
  backHref: string;
}) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [marks, setMarks] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiBase}/assignments/${assignmentId}`);
      const json = (await res.json()) as DetailResponse;
      if (!res.ok) {
        setError(json.error ?? 'Could not load the assignment');
        return;
      }
      setData(json);
    } catch {
      setError('Could not load the assignment');
    } finally {
      setLoading(false);
    }
  }, [apiBase, assignmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function grade(submission: AssignmentSubmission) {
    setBusy(true);
    setNotice('');
    try {
      const res = await fetch(`/api/instructor/submissions/${submission.id}/grade`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marks: Number(marks), feedback: feedback.trim() || null }),
      });
      if (!res.ok) {
        setNotice(await readError(res, 'Could not save the grade'));
        return;
      }
      setGradingId(null);
      setMarks('');
      setFeedback('');
      setNotice('Grade saved.');
      await load();
    } catch {
      setNotice('Could not save the grade');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-muted text-sm">Loading assignment…</p>;
  }
  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link href={backHref} className="text-sm text-primary-text hover:underline">
          ← Back to Assignments
        </Link>
        <p className="text-red-400 text-sm">{error || 'Assignment not found.'}</p>
      </div>
    );
  }

  const { assignment, submissions } = data;
  const gradedCount = submissions.filter((s) => s.status === 'graded').length;

  return (
    <div className="space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-primary-text hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Assignments
        </Link>
        <h1 className="text-2xl font-black text-foreground mt-2">{assignment.title}</h1>
        <p className="text-muted text-sm mt-1">
          {assignment.courseTitle ?? 'Course'} · Max marks {assignment.maxMarks}
          {assignment.dueDate ? ` · Due ${formatDateTime(assignment.dueDate)}` : ' · No due date'}
          {assignment.batchLabel ? ` · ${assignment.batchLabel}` : ''}
        </p>
        <p className="text-foreground/80 text-sm mt-3 whitespace-pre-wrap">{assignment.description}</p>
        <p className="text-muted text-sm mt-2">
          {submissions.length} submission{submissions.length !== 1 ? 's' : ''} · {gradedCount} graded
        </p>
      </div>

      {notice && <p className="text-sm text-primary-text">{notice}</p>}

      {submissions.length === 0 ? (
        <Card className="py-12 text-center">
          <FileText className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-foreground font-semibold">No submissions yet</p>
          <p className="text-muted text-sm mt-1">Students will appear here once they submit their Colab link.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {submissions.map((s) => (
            <Card key={s.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{s.studentName ?? 'Student'}</p>
                  <p className="text-xs text-muted truncate">{s.studentEmail ?? ''}</p>
                  <p className="text-xs text-muted mt-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Submitted {formatDateTime(s.submittedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {s.isLate && <Badge variant="warning">Late</Badge>}
                  <Badge variant={s.status === 'graded' ? 'success' : s.status === 'late' ? 'warning' : 'info'}>
                    {s.status === 'graded' ? 'Graded' : s.status === 'late' ? 'Late' : 'Submitted'}
                  </Badge>
                  {s.status === 'graded' && s.marks !== null && (
                    <Badge variant="primary">
                      {s.marks} / {assignment.maxMarks}
                    </Badge>
                  )}
                </div>
              </div>

              <a
                href={s.colabUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary-text hover:underline break-all"
              >
                <ExternalLink className="w-4 h-4 shrink-0" /> Open Colab notebook
              </a>

              {s.status === 'graded' ? (
                <div className="mt-3 rounded-lg bg-background border border-dark-border p-3">
                  <p className="text-sm font-semibold text-foreground">
                    Marks: {s.marks} / {assignment.maxMarks}
                    {s.graderName ? ` · Graded by ${s.graderName}` : ''}
                    {s.gradedAt ? ` · ${formatDateTime(s.gradedAt)}` : ''}
                  </p>
                  {s.feedback && <p className="text-sm text-foreground/80 mt-1 whitespace-pre-wrap">{s.feedback}</p>}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      setGradingId(s.id);
                      setMarks(String(s.marks ?? ''));
                      setFeedback(s.feedback ?? '');
                    }}
                  >
                    Edit grade
                  </Button>
                </div>
              ) : gradingId === s.id ? (
                <div className="mt-3 space-y-3 rounded-lg bg-background border border-dark-border p-3">
                  <Input
                    label={`Marks (0–${assignment.maxMarks}) *`}
                    type="number"
                    min={0}
                    max={assignment.maxMarks}
                    value={marks}
                    onChange={(e) => setMarks(e.target.value)}
                  />
                  <Textarea
                    label="Feedback (optional)"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={3}
                    placeholder="What did the student do well? What should they improve?"
                  />
                  <div className="flex gap-2">
                    <Button variant="primary" size="sm" loading={busy} onClick={() => void grade(s)}>
                      Save grade
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setGradingId(null);
                        setMarks('');
                        setFeedback('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    setGradingId(s.id);
                    setMarks('');
                    setFeedback('');
                  }}
                >
                  Grade this submission
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
