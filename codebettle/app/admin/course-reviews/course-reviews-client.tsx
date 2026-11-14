'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import StarRating from '@/components/ui/StarRating';
import type { Review, ReviewStatus } from '@/lib/db/types';
import { AlertTriangle, Check, Pencil, Trash2, X } from 'lucide-react';

/**
 * Admin > Course Reviews — the moderation queue for student-submitted
 * per-course reviews (consistent with Success Stories). Pending reviews
 * are not public until approved. Approve / Reject, edit before
 * publishing, real DB delete. Nothing here touches the admin-managed
 * home carousel (StudentReview) — that lives in Admin > Reviews.
 */

type Tab = 'all' | ReviewStatus;

interface CourseReviewsResponse {
  reviews: Review[];
  columnsReady: boolean;
  studentNames?: Record<string, string>;
  courseTitles?: Record<string, string>;
  error?: string;
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const STATUS_BADGE: Record<ReviewStatus, string> = {
  pending: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  approved: 'bg-green-500/15 text-green-300 border-green-500/30',
  rejected: 'bg-red-500/15 text-red-300 border-red-500/30',
};

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as { error?: string };
    return json.error ?? fallback;
  } catch {
    return fallback;
  }
}

export default function CourseReviewsClient() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});
  const [courseTitles, setCourseTitles] = useState<Record<string, string>>({});
  const [columnsReady, setColumnsReady] = useState(true);
  const [tab, setTab] = useState<Tab>('pending');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Review | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editComment, setEditComment] = useState('');
  const [editRating, setEditRating] = useState(5);
  const [editStatus, setEditStatus] = useState<ReviewStatus>('pending');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/course-reviews?status=all');
      const json = (await res.json()) as CourseReviewsResponse;
      if (!res.ok) throw new Error(json.error ?? 'Could not load course reviews');
      setReviews(json.reviews ?? []);
      setStudentNames(json.studentNames ?? {});
      setCourseTitles(json.courseTitles ?? {});
      setColumnsReady(json.columnsReady !== false);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load course reviews');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (message: string) => {
    setNotice(message);
    setError(null);
    window.setTimeout(() => setNotice(null), 4000);
  };
  const fail = (message: string) => {
    setError(message);
    setNotice(null);
  };

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: reviews.length, pending: 0, approved: 0, rejected: 0 };
    for (const r of reviews) c[r.status] += 1;
    return c;
  }, [reviews]);

  const visible = useMemo(
    () => (tab === 'all' ? reviews : reviews.filter((r) => r.status === tab)),
    [reviews, tab],
  );

  const patch = async (review: Review, body: Record<string, unknown>, doneMessage: string) => {
    setBusyId(review.id);
    try {
      const res = await fetch(`/api/admin/course-reviews/${review.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res, 'Could not update the review'));
      const json = (await res.json()) as { review: Review };
      setReviews((rs) => rs.map((r) => (r.id === review.id ? json.review : r)));
      setEditing(null);
      flash(doneMessage);
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not update the review');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (review: Review) => {
    if (!window.confirm(`Delete this review by ${studentNames[review.studentId] ?? 'the student'}? This cannot be undone.`)) return;
    setBusyId(review.id);
    try {
      const res = await fetch(`/api/admin/course-reviews/${review.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res, 'Could not delete the review'));
      setReviews((rs) => rs.filter((r) => r.id !== review.id));
      flash('Review deleted.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not delete the review');
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (review: Review) => {
    setEditing(review);
    setEditTitle(review.title ?? '');
    setEditComment(review.comment);
    setEditRating(review.rating);
    setEditStatus(review.status);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editComment.trim()) {
      fail('Review text is required.');
      return;
    }
    await patch(
      editing,
      { title: editTitle.trim() || null, comment: editComment.trim(), rating: editRating, status: editStatus },
      'Review updated.',
    );
  };

  if (loading) {
    return <p className="text-sm text-zinc-400">Loading course reviews…</p>;
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
        {loadError}{' '}
        <button type="button" className="underline" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Course Reviews</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Student-submitted reviews for each course. Pending reviews are not shown on the public course
          page until you approve them.
        </p>
      </div>

      {!columnsReady && (
        <div className="flex items-start gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            The Course Reviews migration has not run yet. Reviews are still being listed from the old
            columns, but moderation (approve / reject / edit) needs the new columns. Run{' '}
            <code className="rounded bg-black/40 px-1.5 py-0.5">codebettle-course-reviews-migration.sql</code>{' '}
            in the Supabase SQL Editor, then reload this page.
          </p>
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-200">{notice}</div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-primary bg-primary text-ink'
                : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'
            }`}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-8 text-center text-sm text-zinc-400">
          {tab === 'pending'
            ? 'No reviews waiting for approval.'
            : tab === 'all'
              ? 'No student reviews yet. Reviews appear here once a student reviews a course they are enrolled in.'
              : `No ${tab} reviews.`}
        </div>
      ) : (
        <ul className="space-y-4">
          {visible.map((review) => (
            <li key={review.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StarRating rating={review.rating} size="sm" />
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[review.status]}`}>
                      {STATUS_LABEL[review.status]}
                    </span>
                  </div>
                  {review.title && <p className="mt-2 font-semibold text-foreground">{review.title}</p>}
                  <p className="mt-1 text-sm text-zinc-300 whitespace-pre-wrap">{review.comment}</p>
                  <p className="mt-2 text-xs text-zinc-500">
                    {studentNames[review.studentId] ?? 'Student'} · {courseTitles[review.courseId] ?? 'Course'} ·{' '}
                    {review.createdAt}
                    {review.updatedAt && review.updatedAt !== review.createdAt ? ` · edited ${review.updatedAt}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {review.status !== 'approved' && (
                    <Button
                      size="sm"
                      disabled={busyId === review.id || !columnsReady}
                      onClick={() => void patch(review, { status: 'approved' }, 'Review approved — it is now public.')}
                    >
                      <Check className="mr-1 h-4 w-4" /> Approve
                    </Button>
                  )}
                  {review.status !== 'rejected' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === review.id || !columnsReady}
                      onClick={() => void patch(review, { status: 'rejected' }, 'Review rejected — it stays hidden.')}
                    >
                      <X className="mr-1 h-4 w-4" /> Reject
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" disabled={busyId === review.id} onClick={() => startEdit(review)}>
                    <Pencil className="mr-1 h-4 w-4" /> Edit
                  </Button>
                  <Button size="sm" variant="danger" disabled={busyId === review.id} onClick={() => void remove(review)}>
                    <Trash2 className="mr-1 h-4 w-4" /> Delete
                  </Button>
                </div>
              </div>

              {editing?.id === review.id && (
                <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-400">Rating</label>
                    <StarRating rating={editRating} interactive onChange={setEditRating} />
                  </div>
                  <Input
                    label="Title (optional)"
                    value={editTitle}
                    maxLength={200}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="A short headline for this review"
                  />
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-zinc-400">Review</span>
                    <textarea
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-foreground outline-none focus:border-yellow-400"
                      rows={4}
                      maxLength={2000}
                      value={editComment}
                      onChange={(e) => setEditComment(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-zinc-400">Status</span>
                    <select
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-foreground outline-none focus:border-yellow-400"
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as ReviewStatus)}
                    >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busyId === review.id} onClick={() => void saveEdit()}>
                      Save changes
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
