'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import type { Assignment, AssignmentSubmission } from '@/lib/db/types';
import { AlertTriangle, ClipboardList, ExternalLink } from 'lucide-react';

/**
 * Student > Assignments — the assignments for the student's enrolled
 * courses, with the student's own Colab link submission and the
 * teacher's marks + feedback once graded.
 *
 * A submission is a Google Colab LINK only — the student pastes the
 * notebook URL, no file is uploaded. The link can be updated until
 * the teacher grades it; a graded submission cannot be changed.
 */

interface StudentAssignment extends Assignment {
  mySubmission: AssignmentSubmission | null;
}

interface ListResponse {
  assignments: StudentAssignment[];
  tablesReady: boolean;
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
  if (!iso) return 'No due date';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No due date';
  return d.toLocaleString();
}

export default function StudentAssignmentsClient() {
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [tablesReady, setTablesReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [linkById, setLinkById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/student/assignments');
      const json = (await res.json()) as ListResponse;
      if (!res.ok) {
        setError(json.error ?? 'Could not load assignments');
        return;
      }
      setAssignments(json.assignments);
      setTablesReady(json.tablesReady);
      setLinkById(
        Object.fromEntries(
          json.assignments.map((a) => [a.id, a.mySubmission?.colabUrl ?? '']),
        ),
      );
    } catch {
      setError('Could not load assignments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(a: StudentAssignment) {
    setBusyId(a.id);
    setNotice('');
    try {
      const res = await fetch(`/api/student/assignments/${a.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colabUrl: linkById[a.id] ?? '' }),
      });
      if (!res.ok) {
        setNotice(await readError(res, 'Could not submit the assignment'));
        return;
      }
      setNotice('Colab link submitted.');
      await load();
    } catch {
      setNotice('Could not submit the assignment');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-muted text-sm">Loading assignments…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground">Assignments</h1>
        <p className="text-muted text-sm mt-1">
          Submit your work as a Google Colab link — no files to upload. You can update the link until the teacher grades it.
        </p>
      </div>

      {!tablesReady && (
        <Card className="p-4 flex items-start gap-3 border-yellow-500/40">
          <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-sm text-foreground/80">
            Assignments are not set up yet — please ask the admin to run the assignments migration.
          </p>
        </Card>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {notice && <p className="text-sm text-primary-text">{notice}</p>}

      {assignments.length === 0 ? (
        <Card className="py-16 text-center">
          <ClipboardList className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-foreground font-semibold mb-2">No assignments yet</p>
          <p className="text-muted text-sm">Your teachers will set assignments for your enrolled courses.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {assignments.map((a) => {
            const sub = a.mySubmission;
            const graded = sub?.status === 'graded';
            return (
              <Card key={a.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-foreground">{a.title}</p>
                    <p className="text-xs text-muted mt-1">
                      {a.courseTitle ?? 'Course'}
                      {a.batchLabel ? ` · ${a.batchLabel}` : ''} · Max {a.maxMarks} marks · Due{' '}
                      {formatDateTime(a.dueDate)}
                    </p>
                    <p className="text-sm text-foreground/80 mt-2 whitespace-pre-wrap">{a.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {sub?.isLate && <Badge variant="warning">Late</Badge>}
                    <Badge variant={graded ? 'success' : sub ? 'info' : 'muted'}>
                      {graded ? 'Graded' : sub ? 'Submitted' : 'Not submitted'}
                    </Badge>
                    {graded && sub.marks !== null && (
                      <Badge variant="primary">
                        {sub.marks} / {a.maxMarks}
                      </Badge>
                    )}
                  </div>
                </div>

                {graded && sub ? (
                  <div className="mt-4 rounded-lg bg-background border border-dark-border p-3">
                    <p className="text-sm font-semibold text-foreground">
                      Your marks: {sub.marks} / {a.maxMarks}
                      {sub.gradedAt ? ` · Graded ${formatDateTime(sub.gradedAt)}` : ''}
                    </p>
                    {sub.feedback && (
                      <p className="text-sm text-foreground/80 mt-1 whitespace-pre-wrap">{sub.feedback}</p>
                    )}
                    <a
                      href={sub.colabUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary-text hover:underline break-all"
                    >
                      <ExternalLink className="w-4 h-4 shrink-0" /> Your submitted notebook
                    </a>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {sub && (
                      <a
                        href={sub.colabUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-primary-text hover:underline break-all"
                      >
                        <ExternalLink className="w-4 h-4 shrink-0" /> Your submitted notebook (submitted{' '}
                        {formatDateTime(sub.submittedAt)})
                      </a>
                    )}
                    <Input
                      label="Google Colab link *"
                      value={linkById[a.id] ?? ''}
                      onChange={(e) => setLinkById({ ...linkById, [a.id]: e.target.value })}
                      placeholder="https://colab.research.google.com/drive/…"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      loading={busyId === a.id}
                      onClick={() => void submit(a)}
                    >
                      {sub ? 'Update Colab link' : 'Submit Colab link'}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
