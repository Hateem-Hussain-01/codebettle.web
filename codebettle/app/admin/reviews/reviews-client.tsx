'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import StarRating from '@/components/ui/StarRating';
import type { StudentReview } from '@/lib/db/types';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';

/**
 * Admin > Reviews (PR #32) — the home page "What Our Students Say"
 * carousel, managed here. List, enable/disable toggle, add, edit,
 * delete, reorder. Enabled reviews appear in the home carousel;
 * disabled ones stay here, hidden from the public page.
 */

interface ReviewsResponse {
  reviews: StudentReview[];
  tablesReady: boolean;
  error?: string;
}

const EMPTY_FORM = {
  fullName: '',
  role: '',
  photoUrl: '',
  rating: 5,
  reviewText: '',
  linkedinUrl: '',
  githubUrl: '',
  websiteUrl: '',
  order: 0,
};

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as { error?: string };
    return json.error ?? fallback;
  } catch {
    return fallback;
  }
}

export default function ReviewsClient() {
  const [reviews, setReviews] = useState<StudentReview[]>([]);
  const [tablesReady, setTablesReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/reviews');
      const json = (await res.json()) as ReviewsResponse;
      if (!res.ok) throw new Error(json.error ?? 'Could not load reviews');
      setReviews(json.reviews ?? []);
      setTablesReady(json.tablesReady !== false);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load reviews');
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

  const uploadPhoto = async (file: File) => {
    setPhotoBusy(true);
    try {
      const data = new FormData();
      data.append('photo', file);
      const res = await fetch('/api/admin/reviews/photo', { method: 'POST', body: data });
      if (!res.ok) throw new Error(await readError(res, 'Photo upload failed'));
      const json = (await res.json()) as { url: string };
      setForm((f) => ({ ...f, photoUrl: json.url }));
      flash('Photo uploaded.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Photo upload failed');
    } finally {
      setPhotoBusy(false);
    }
  };

  const saveReview = async () => {
    setBusy(true);
    try {
      const payload = { ...form, rating: Number(form.rating) || 5, order: Number(form.order) || 0 };
      const res = await fetch(editingId ? `/api/admin/reviews/${editingId}` : '/api/admin/reviews', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readError(res, 'Could not save the review'));
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      await load();
      flash(editingId ? 'Review updated.' : 'Review added — it shows in the home carousel now.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not save the review');
    } finally {
      setBusy(false);
    }
  };

  const toggleReview = async (review: StudentReview) => {
    const res = await fetch(`/api/admin/reviews/${review.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !review.enabled }),
    });
    if (!res.ok) {
      fail(await readError(res, 'Could not update the review'));
      return;
    }
    await load();
  };

  const moveReview = async (review: StudentReview, direction: 'up' | 'down') => {
    const sorted = [...reviews].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
    const idx = sorted.findIndex((r) => r.id === review.id);
    const other = direction === 'up' ? sorted[idx - 1] : sorted[idx + 1];
    if (!other) return;
    const [r1, r2] = await Promise.all([
      fetch(`/api/admin/reviews/${review.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: other.order }),
      }),
      fetch(`/api/admin/reviews/${other.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: review.order }),
      }),
    ]);
    if (!r1.ok || !r2.ok) {
      fail('Could not reorder the review');
      return;
    }
    await load();
  };

  const deleteReview = async (review: StudentReview) => {
    if (!window.confirm(`Delete ${review.fullName}'s review?`)) return;
    const res = await fetch(`/api/admin/reviews/${review.id}`, { method: 'DELETE' });
    if (!res.ok) {
      fail(await readError(res, 'Could not delete the review'));
      return;
    }
    await load();
    flash('Review deleted.');
  };

  if (loading) {
    return <p className="text-muted">Loading reviews…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Star className="w-6 h-6 text-primary-text" /> Reviews
          </h1>
          <p className="text-muted text-sm mt-1">
            The home page “What Our Students Say” carousel. Enabled reviews appear in the carousel; disabled ones stay here, hidden from the public page.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setForm(EMPTY_FORM);
            setEditingId(null);
            setShowForm((s) => !s);
          }}
        >
          <Plus className="w-4 h-4" /> Add review
        </Button>
      </div>

      {notice && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 text-green-300 text-sm px-4 py-3">{notice}</div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-4 py-3">{error}</div>
      )}
      {loadError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-4 py-3">{loadError}</div>
      )}
      {!tablesReady && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-300 text-sm px-4 py-3 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            The student review table is not set up yet — run{' '}
            <code className="font-mono">codebettle-success-stories-mgmt-migration.sql</code> in the Supabase SQL Editor first.
          </span>
        </div>
      )}

      {showForm && (
        <div className="bg-dark-card border border-dark-border rounded-xl p-6 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Full name *" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="e.g. Ali Raza" />
            <Input label="Role *" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. Python Student" />
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground/80">
              Rating (1–5)
              <select
                value={form.rating}
                onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}
                className="w-full bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-foreground"
              >
                {[5, 4, 3, 2, 1].map((r) => (
                  <option key={r} value={r}>{r} star{r > 1 ? 's' : ''}</option>
                ))}
              </select>
            </label>
            <Input label="Order in carousel" type="number" min={0} value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} />
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground/80">
            Review *
            <textarea
              value={form.reviewText}
              onChange={(e) => setForm({ ...form, reviewText: e.target.value })}
              rows={4}
              maxLength={2000}
              className="w-full bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-foreground"
              placeholder="The student's own words about learning with CodeBettle"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-border text-foreground text-sm font-semibold cursor-pointer hover:opacity-90">
              <Upload className="w-4 h-4" />
              {form.photoUrl ? 'Photo uploaded ✓' : 'Upload photo (JPG/PNG/WebP, max 5 MB)'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadPhoto(f);
                }}
              />
            </label>
            {photoBusy && <span className="text-xs text-muted">Uploading…</span>}
            {form.photoUrl && (
              <a href={form.photoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-text underline break-all">
                View photo
              </a>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="LinkedIn URL" value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} />
            <Input label="GitHub URL" value={form.githubUrl} onChange={(e) => setForm({ ...form, githubUrl: e.target.value })} />
            <Input label="Website URL" value={form.websiteUrl} onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" loading={busy} onClick={() => void saveReview()}>
              {editingId ? 'Save changes' : 'Add review'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
          </div>
        </div>
      )}

      <section className="bg-dark-card border border-dark-border rounded-xl p-6">
        {reviews.length === 0 ? (
          <p className="text-sm text-muted">
            No reviews yet — add real student reviews here. The home carousel stays hidden until you do; no fake reviews are seeded.
          </p>
        ) : (
          <ul className="divide-y divide-dark-border">
            {reviews.map((review) => (
              <li key={review.id} className="py-4 flex items-start gap-4">
                {review.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={review.photoUrl} alt={review.fullName} className="w-12 h-12 rounded-full object-cover border-2 border-primary/40 shrink-0" />
                ) : (
                  <span className="w-12 h-12 rounded-full bg-primary/10 border-2 border-primary/40 flex items-center justify-center font-black text-primary-text shrink-0">
                    {review.fullName.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{review.fullName}</p>
                    <span className="text-xs text-muted">{review.role}</span>
                    <StarRating rating={review.rating} size="sm" />
                  </div>
                  <p className="text-sm text-muted leading-relaxed mt-1 line-clamp-2">“{review.reviewText}”</p>
                  <p className="text-xs text-muted mt-1">Order {review.order} · {review.enabled ? 'Shown in the home carousel' : 'Hidden from the carousel'}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => void moveReview(review, 'up')} aria-label="Move up" className="p-1.5 text-muted hover:text-foreground"><ArrowUp className="w-4 h-4" /></button>
                  <button onClick={() => void moveReview(review, 'down')} aria-label="Move down" className="p-1.5 text-muted hover:text-foreground"><ArrowDown className="w-4 h-4" /></button>
                  <button
                    onClick={() => void toggleReview(review)}
                    aria-label={review.enabled ? 'Hide from carousel' : 'Show in carousel'}
                    title={review.enabled ? 'Hide from carousel' : 'Show in carousel'}
                    className="p-1.5 text-muted hover:text-foreground"
                  >
                    {review.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => {
                      setForm({
                        fullName: review.fullName,
                        role: review.role,
                        photoUrl: review.photoUrl ?? '',
                        rating: review.rating,
                        reviewText: review.reviewText,
                        linkedinUrl: review.linkedinUrl ?? '',
                        githubUrl: review.githubUrl ?? '',
                        websiteUrl: review.websiteUrl ?? '',
                        order: review.order,
                      });
                      setEditingId(review.id);
                      setShowForm(true);
                    }}
                    aria-label="Edit"
                    className="p-1.5 text-muted hover:text-foreground"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => void deleteReview(review)} aria-label="Delete" className="p-1.5 text-red-400 hover:text-red-300">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
