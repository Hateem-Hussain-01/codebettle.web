'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdminUrl } from '@/components/admin/AdminBasePathContext';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Download, Inbox, Eye, EyeOff, Pencil,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import Select from '@/components/ui/Select';
import Spinner from '@/components/ui/Spinner';
import { formatDateShort } from '@/lib/utils';
import { formatFileSize, isFileReference } from '@/lib/form-uploads';
import {
  formatSubmissionValue,
  type AdminFormDetail,
  type AdminSubmission,
} from '@/lib/forms';
import toast from 'react-hot-toast';

/** Must match the API default (lib/db/pagination.ts DEFAULT_PAGE_SIZE). */
const PAGE_SIZE = 25;

type ReviewFilter = '' | 'reviewed' | 'unreviewed';

/**
 * Admin submissions view (Phase 6, Worker B).
 * Lists submissions for one form (GET /api/admin/forms/[id]/submissions),
 * filters by reviewed/unreviewed, opens a single submission showing
 * each field label + submitted value (labels come from the form schema,
 * fetched via GET /api/admin/forms/[id]), toggles reviewed state
 * (PATCH), and exports CSV (GET .../submissions/export, downloaded
 * as a file).
 */
export default function SubmissionsClient({ formId }: { formId: string }) {
  const router = useRouter();
  const adminUrl = useAdminUrl();
  const [form, setForm] = useState<AdminFormDetail | null>(null);
  const [submissions, setSubmissions] = useState<AdminSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReviewFilter>('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminSubmission | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [openingFile, setOpeningFile] = useState<string | null>(null);

  const loadForm = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/forms/${formId}`);
      const body = await res.json().catch(() => ({}));
      if (res.ok) setForm(body.form as AdminFormDetail);
    } catch {
      // Labels fall back to raw field ids; the list still works.
    }
  }, [formId]);

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (filter) params.set('status', filter);
      const res = await fetch(`/api/admin/forms/${formId}/submissions?${params.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(body.error ?? 'Could not load submissions');
        return;
      }
      setSubmissions(Array.isArray(body.submissions) ? body.submissions : []);
      setTotal(typeof body.total === 'number' ? body.total : 0);
    } catch {
      setLoadError('Could not load submissions — check your connection and try again');
    } finally {
      setLoading(false);
    }
  }, [formId, filter, page]);

  // Deferred to a microtask: the loaders set state synchronously at
  // their start, and calling them directly in the effect body trips the
  // react-hooks/set-state-in-effect rule. Same loaders as Refresh.
  useEffect(() => {
    void Promise.resolve().then(() => loadForm());
  }, [loadForm]);

  useEffect(() => {
    void Promise.resolve().then(() => loadSubmissions());
  }, [loadSubmissions]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openSubmission = async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/forms/${formId}/submissions/${id}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? 'Could not load this submission');
        setSelectedId(null);
        return;
      }
      setSelected(body.submission as AdminSubmission);
      // The detail endpoint also returns the form — use it for field
      // labels if the standalone form fetch failed or is stale.
      if (body.form) setForm(body.form as AdminFormDetail);
    } catch {
      toast.error('Could not load this submission — check your connection and try again');
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleReviewed = async (submission: AdminSubmission) => {
    setMarking(true);
    try {
      const res = await fetch(`/api/admin/forms/${formId}/submissions/${submission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewed: !submission.reviewed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? 'Could not update the submission');
        return;
      }
      const saved = (body.submission ?? { ...submission, reviewed: !submission.reviewed }) as AdminSubmission;
      setSubmissions((ss) => ss.map((s) => (s.id === saved.id ? saved : s)));
      setSelected((s) => (s && s.id === saved.id ? saved : s));
      toast.success(saved.reviewed ? 'Marked as reviewed' : 'Marked as unreviewed');
    } catch {
      toast.error('Could not update the submission — check your connection and try again');
    } finally {
      setMarking(false);
    }
  };

  /**
   * Open an uploaded file: fetch a short-lived signed URL from the
   * admin file route (admin-only) and open it in a new tab. The
   * stored value is only a private storage path — never a public URL.
   */
  const openFile = async (fieldId: string) => {
    if (!selected) return;
    setOpeningFile(fieldId);
    try {
      const res = await fetch(
        `/api/admin/forms/${formId}/submissions/${selected.id}/file?field=${encodeURIComponent(fieldId)}`,
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? 'Could not open the file');
        return;
      }
      if (typeof body.url === 'string') {
        window.open(body.url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      toast.error('Could not open the file — check your connection and try again');
    } finally {
      setOpeningFile(null);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      // The export honours the same reviewed/unreviewed filter as
      // the list: '' = all, 'reviewed' / 'unreviewed' = that slice.
      const params = new URLSearchParams();
      if (filter === 'reviewed') params.set('reviewed', 'true');
      else if (filter === 'unreviewed') params.set('reviewed', 'false');
      const query = params.toString();
      const res = await fetch(
        `/api/admin/forms/${formId}/submissions/export${query ? `?${query}` : ''}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? 'Could not export submissions');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form?.slug ?? 'form'}-submissions.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const exported = Number(res.headers.get('X-Export-Count'));
      const count = Number.isFinite(exported) ? exported : total;
      toast.success(
        `Exported ${count} submission${count === 1 ? '' : 's'} as CSV` +
          (filter === 'reviewed' ? ' (reviewed only)' : filter === 'unreviewed' ? ' (unreviewed only)' : ''),
      );
    } catch {
      toast.error('Could not export submissions — check your connection and try again');
    } finally {
      setExporting(false);
    }
  };

  /** Rows for the detail view: schema fields first (in order), then any unknown keys. */
  const detailRows = useMemo(() => {
    if (!selected) return [];
    const rows: { key: string; label: string; value: unknown }[] = [];
    const seen = new Set<string>();
    for (const field of form?.schema?.fields ?? []) {
      seen.add(field.id);
      rows.push({ key: field.id, label: field.label, value: selected.data?.[field.id] });
    }
    for (const [key, value] of Object.entries(selected.data ?? {})) {
      if (!seen.has(key)) rows.push({ key, label: key, value });
    }
    return rows;
  }, [selected, form]);

  const reviewedCount = submissions.filter((s) => s.reviewed).length;

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={adminUrl("/forms")} className="text-muted hover:text-foreground p-1 shrink-0" title="Back to forms">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-foreground truncate">
              {form ? `${form.name} — Submissions` : 'Submissions'}
            </h1>
            <p className="text-muted text-sm mt-1">
              {total} submission{total !== 1 ? 's' : ''} total
              {submissions.length > 0 ? ` · ${reviewedCount} reviewed on this page` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={() => router.push(adminUrl(`/forms/${formId}/builder`))}>
            <Pencil className="w-4 h-4" />Open builder
          </Button>
          <Button size="sm" onClick={() => void exportCsv()} loading={exporting} disabled={exporting}>
            <Download className="w-4 h-4" />
            {filter === 'reviewed'
              ? 'Export CSV (reviewed only)'
              : filter === 'unreviewed'
                ? 'Export CSV (unreviewed only)'
                : 'Export CSV (all)'}
          </Button>
        </div>
      </FadeIn>

      <FadeIn delay={0.05} className="flex flex-col sm:flex-row gap-3">
        <div className="sm:w-52">
          <Select
            label="Reviewed"
            options={[
              { value: '', label: 'All submissions' },
              { value: 'unreviewed', label: 'Unreviewed only' },
              { value: 'reviewed', label: 'Reviewed only' },
            ]}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as ReviewFilter);
              setPage(1);
              setSelectedId(null);
              setSelected(null);
            }}
          />
        </div>
        <div className="flex items-end">
          <Button variant="outline" size="sm" onClick={() => void loadSubmissions()}>
            Refresh
          </Button>
        </div>
      </FadeIn>

      {loading ? (
        <Card className="py-16 text-center">
          <Spinner className="mx-auto" />
          <p className="text-muted text-sm mt-3">Loading submissions…</p>
        </Card>
      ) : loadError ? (
        <Card className="py-16 text-center">
          <p className="text-foreground font-medium">Couldn&apos;t load submissions</p>
          <p className="text-muted text-sm mt-1">{loadError}</p>
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" size="sm" onClick={() => void loadSubmissions()}>Try again</Button>
          </div>
        </Card>
      ) : submissions.length === 0 ? (
        <Card className="py-16 text-center">
          <Inbox className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-foreground font-medium">
            {filter ? 'No submissions match this filter' : 'No submissions yet'}
          </p>
          <p className="text-muted text-sm mt-1">
            {filter
              ? 'Try a different filter.'
              : 'Responses will appear here once someone submits this form.'}
          </p>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-[1fr_380px] gap-4 items-start">
          <FadeIn delay={0.08} className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-border bg-dark-border/20">
                    {['Submitted', 'Submitter', 'Status', ''].map((h) => (
                      <th key={h} className="text-left text-muted text-xs py-3 px-4 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => void openSubmission(s.id)}
                      className={`border-b border-dark-border/40 last:border-0 hover:bg-dark-border/10 cursor-pointer ${selectedId === s.id ? 'bg-primary/5' : ''}`}
                    >
                      <td className="py-3 px-4 text-foreground text-xs font-medium">{formatDateShort(s.submittedAt)}</td>
                      <td className="py-3 px-4 text-muted text-xs">
                        {s.submitterId ? s.submitterId : 'Guest'}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={s.reviewed ? 'success' : 'warning'}>
                          {s.reviewed ? 'Reviewed' : 'Unreviewed'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-primary-text text-xs">View →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-dark-border">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />Previous
                </Button>
                <p className="text-muted text-xs">Page {page} of {totalPages}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next<ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </FadeIn>

          {/* Single-submission detail */}
          <Card className="lg:sticky lg:top-4">
            {!selectedId ? (
              <div className="py-10 text-center">
                <Inbox className="w-8 h-8 text-muted mx-auto mb-2" />
                <p className="text-foreground font-medium text-sm">Select a submission</p>
                <p className="text-muted text-xs mt-1">Click a row to see every answer.</p>
              </div>
            ) : detailLoading ? (
              <div className="py-10 text-center">
                <Spinner className="mx-auto" />
                <p className="text-muted text-sm mt-3">Loading submission…</p>
              </div>
            ) : selected ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-foreground">Submission</h2>
                    <p className="text-muted text-xs mt-0.5">
                      {formatDateShort(selected.submittedAt)} · {selected.submitterId ? `Submitter ${selected.submitterId}` : 'Guest'}
                    </p>
                  </div>
                  <Badge variant={selected.reviewed ? 'success' : 'warning'}>
                    {selected.reviewed ? 'Reviewed' : 'Unreviewed'}
                  </Badge>
                </div>
                <dl className="space-y-3">
                  {detailRows.length === 0 ? (
                    <p className="text-muted text-sm">This submission has no answers.</p>
                  ) : (
                    detailRows.map((row) => (
                      <div key={row.key} className="border-b border-dark-border/40 last:border-0 pb-2 last:pb-0">
                        <dt className="text-xs text-muted">{row.label}</dt>
                        <dd className="text-sm text-foreground mt-0.5 break-words">
                          {isFileReference(row.value) ? (
                            <button
                              type="button"
                              onClick={() => void openFile(row.key)}
                              disabled={openingFile === row.key}
                              className="inline-flex items-center gap-1.5 text-primary-text hover:underline cursor-pointer disabled:opacity-50 text-left"
                            >
                              <Download className="w-4 h-4 shrink-0" />
                              <span>
                                {row.value.name} ({formatFileSize(row.value.size)})
                                {openingFile === row.key ? ' — opening…' : ''}
                              </span>
                            </button>
                          ) : (
                            formatSubmissionValue(row.value)
                          )}
                        </dd>
                      </div>
                    ))
                  )}
                </dl>
                <Button
                  variant={selected.reviewed ? 'secondary' : 'primary'}
                  fullWidth
                  onClick={() => void toggleReviewed(selected)}
                  loading={marking}
                  disabled={marking}
                >
                  {selected.reviewed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {selected.reviewed ? 'Mark unreviewed' : 'Mark reviewed'}
                </Button>
              </div>
            ) : null}
          </Card>
        </div>
      )}
    </div>
  );
}
