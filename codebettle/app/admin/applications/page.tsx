'use client';
import { useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { UserCheck, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Application {
  id: string;
  name: string;
  email: string;
  phone?: string;
  expertise?: string;
  experience?: string;
  message?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedByName?: string | null;
  createdAt: string;
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

const PAGE_LIMIT = 10;

/**
 * Admin applications — backed by the real API routes (Phase 3).
 * GET /api/admin/applications?status=&page=&limit= on mount and whenever
 * the status filter or page changes; PATCH /api/admin/applications/[id]
 * to approve or reject. Only a pending application can be reviewed —
 * the server returns 400 on a re-review.
 */
export default function AdminApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const loadApplications = async (status: StatusFilter, pageToLoad: number) => {
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams({ page: String(pageToLoad), limit: String(PAGE_LIMIT) });
      if (status !== 'all') params.set('status', status);
      const res = await fetch(`/api/admin/applications?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load applications');
      setApps(data.applications);
      setPage(data.page ?? pageToLoad);
      setTotalPages(data.totalPages ?? 1);
      setTotal(data.total ?? data.applications.length);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadApplications(statusFilter, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const changePage = (next: number) => {
    const clamped = Math.min(Math.max(1, next), totalPages);
    if (clamped !== page) loadApplications(statusFilter, clamped);
  };

  const handleAction = async (id: string, status: 'approved' | 'rejected') => {
    setReviewingId(id);
    try {
      const res = await fetch(`/api/admin/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not review application'); return; }
      setApps(a => a.map(app => app.id === id ? { ...app, ...data.application } : app));
      toast.success(`Application ${status}!`);
    } finally {
      setReviewingId(null);
    }
  };

  const pending = apps.filter(a => a.status === 'pending');
  const reviewed = apps.filter(a => a.status !== 'pending');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">Instructor Applications</h1>
        <p className="text-muted text-sm mt-1">{total} total · {apps.filter(a => a.status === 'approved').length} approved on this page</p>
      </div>

      <div className="flex gap-1 bg-dark-card border border-dark-border rounded-lg p-1 w-fit">
        {(['all', 'pending', 'approved', 'rejected'] as StatusFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize cursor-pointer transition-colors ${statusFilter === f ? 'bg-primary text-black' : 'text-muted hover:text-white'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading && <p className="text-muted text-sm">Loading applications…</p>}
      {loadError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">
          {loadError} <button onClick={() => loadApplications(statusFilter, page)} className="underline cursor-pointer ml-2">Retry</button>
        </div>
      )}

      {!loading && !loadError && apps.length === 0 && (
        <p className="text-muted text-sm">No applications found.</p>
      )}

      {!loading && !loadError && pending.length > 0 && (
        <div>
          <h2 className="text-white font-semibold mb-3 flex items-center gap-2"><UserCheck className="w-4 h-4 text-primary" />Pending Review ({pending.length})</h2>
          <div className="space-y-4">
            {pending.map(app => (
              <Card key={app.id} hover>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">{app.name.charAt(0)}</div>
                      <div>
                        <p className="text-white font-semibold text-sm">{app.name}</p>
                        <p className="text-muted text-xs">{app.email}{app.phone ? ` · ${app.phone}` : ''}</p>
                      </div>
                    </div>
                    {app.expertise && <p className="text-muted text-xs mb-1"><span className="text-white">Expertise:</span> {app.expertise}</p>}
                    {app.experience && <p className="text-muted text-xs mb-2"><span className="text-white">Experience:</span> {app.experience}</p>}
                    {app.message && <p className="text-muted text-xs italic">"{app.message}"</p>}
                    <p className="text-muted text-xs mt-2">Submitted {formatDateShort(app.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button size="sm" variant="danger" onClick={() => handleAction(app.id, 'rejected')} loading={reviewingId === app.id}><X className="w-3.5 h-3.5" />Reject</Button>
                    <Button size="sm" onClick={() => handleAction(app.id, 'approved')} loading={reviewingId === app.id}><Check className="w-3.5 h-3.5" />Approve</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {!loading && !loadError && reviewed.length > 0 && (
        <div>
          <h2 className="text-white font-semibold mb-3">Reviewed ({reviewed.length})</h2>
          <div className="space-y-3">
            {reviewed.map(app => (
              <Card key={app.id} className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-dark-border text-muted flex items-center justify-center font-bold text-sm">{app.name.charAt(0)}</div>
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">{app.name}</p>
                  <p className="text-muted text-xs">{app.email} · {app.expertise}</p>
                  {app.reviewedBy && <p className="text-muted text-xs mt-0.5">Reviewed by {app.reviewedByName ?? app.reviewedBy}</p>}
                </div>
                <Badge variant={app.status === 'approved' ? 'success' : 'danger'}>{app.status}</Badge>
              </Card>
            ))}
          </div>
        </div>
      )}

      {!loading && !loadError && totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => changePage(page - 1)} disabled={page <= 1}><ChevronLeft className="w-4 h-4" />Prev</Button>
          <span className="text-muted text-xs">Page {page} of {totalPages}</span>
          <Button size="sm" variant="secondary" onClick={() => changePage(page + 1)} disabled={page >= totalPages}>Next<ChevronRight className="w-4 h-4" /></Button>
        </div>
      )}
    </div>
  );
}
