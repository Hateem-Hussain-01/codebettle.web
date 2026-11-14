'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import type { Assignment } from '@/lib/db/types';
import { AlertTriangle, ClipboardList, Trash2 } from 'lucide-react';

/**
 * Admin > Assignments — every assignment across all courses, with
 * the teacher, submission counts and grading status. Admins can open
 * any assignment to view its Colab link submissions and grade them,
 * or delete an assignment (with its submissions).
 */

interface ListResponse {
  assignments: Assignment[];
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

export default function AdminAssignmentsClient() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [tablesReady, setTablesReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/assignments');
      const json = (await res.json()) as ListResponse;
      if (!res.ok) {
        setError(json.error ?? 'Could not load assignments');
        return;
      }
      setAssignments(json.assignments);
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

  async function remove(assignment: Assignment) {
    if (!window.confirm(`Delete the assignment “${assignment.title}” and all its submissions?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/assignments/${assignment.id}`, { method: 'DELETE' });
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

  if (loading) return <p className="text-muted text-sm">Loading assignments…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground">Assignments</h1>
        <p className="text-muted text-sm mt-1">
          Every assignment across all courses. Students submit a Google Colab link — no files.
        </p>
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

      {assignments.length === 0 ? (
        <Card className="py-16 text-center">
          <ClipboardList className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-foreground font-semibold mb-2">No assignments yet</p>
          <p className="text-muted text-sm">Teachers create assignments from the instructor portal.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {assignments.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/admin/assignments/${a.id}`}
                    className="font-bold text-foreground hover:text-primary-text"
                  >
                    {a.title}
                  </Link>
                  <p className="text-xs text-muted mt-1">
                    {a.courseTitle ?? 'Course'}
                    {a.batchLabel ? ` · ${a.batchLabel}` : ' · Whole course'} · By {a.creatorName ?? 'Teacher'} ·
                    Max {a.maxMarks} marks · {formatDateTime(a.dueDate)}
                  </p>
                  <p className="text-sm text-foreground/80 mt-2 line-clamp-2">{a.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="info">{a.submissionCount ?? 0} submitted</Badge>
                  <Badge
                    variant={
                      (a.gradedCount ?? 0) === (a.submissionCount ?? 0) && (a.submissionCount ?? 0) > 0
                        ? 'success'
                        : 'muted'
                    }
                  >
                    {a.gradedCount ?? 0} graded
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Link href={`/admin/assignments/${a.id}`}>
                  <Button variant="secondary" size="sm">
                    View submissions
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" loading={busy} onClick={() => void remove(a)} aria-label="Delete">
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
