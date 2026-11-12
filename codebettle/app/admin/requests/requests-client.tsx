'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { formatDateShort } from '@/lib/utils';
import {
  REQUEST_CATEGORIES,
  REQUEST_STATUSES,
  REQUEST_STATUS_BADGE,
  requestCategoryLabel,
  requestStatusLabel,
  type AdminRequest,
  type RequestStatus,
} from '@/components/requests/request-types';

interface RequestsClientProps {
  initialRequests: AdminRequest[];
  total: number;
  totalPages: number;
  page: number;
  statusFilter: string;
  categoryFilter: string;
  search: string;
}

/**
 * Admin support-request queue (Phase 3, Worker C).
 * Presentational: rows are loaded + enriched server-side (see
 * page.tsx — the API returns bare rows, so student names/emails and
 * course titles are resolved on the server). Status/category filters,
 * search and pagination navigate by updating the URL search params,
 * which re-renders the server page. Clicking a row opens its detail
 * page. Search covers the newest 500 rows server-side (see page.tsx).
 */
export default function RequestsClient({
  initialRequests,
  total,
  totalPages,
  page,
  statusFilter,
  categoryFilter,
  search,
}: RequestsClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState(statusFilter);
  const [category, setCategory] = useState(categoryFilter);
  const [searchInput, setSearchInput] = useState(search);

  const navigate = (next: { status?: string; category?: string; q?: string; page?: number }) => {
    const params = new URLSearchParams();
    const s = next.status ?? status;
    const c = next.category ?? category;
    const query = next.q ?? searchInput;
    if (s) params.set('status', s);
    if (c) params.set('category', c);
    if (query.trim()) params.set('q', query.trim());
    params.set('page', String(next.page ?? 1));
    router.push(`/admin/requests?${params.toString()}`);
  };

  const newCount = initialRequests.filter((r) => r.status === 'new').length;

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground">Student Requests</h1>
          <p className="text-muted text-sm mt-1">
            Support requests from students ({total} total{newCount > 0 ? ` — ${newCount} new on this page` : ''})
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.refresh()}>
          Refresh
        </Button>
      </FadeIn>

      <FadeIn delay={0.05}>
        <form
          className="flex flex-col sm:flex-row gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ page: 1 });
          }}
        >
          <div className="sm:w-52">
            <Select
              label="Status"
              options={[
                { value: '', label: 'All statuses' },
                ...REQUEST_STATUSES.map((s) => ({ value: s.value, label: s.label })),
              ]}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                navigate({ status: e.target.value, page: 1 });
              }}
            />
          </div>
          <div className="sm:w-60">
            <Select
              label="Category"
              options={[
                { value: '', label: 'All categories' },
                ...REQUEST_CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
              ]}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                navigate({ category: e.target.value, page: 1 });
              }}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Search"
              placeholder="Student name, email or subject…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" variant="secondary">Search</Button>
          </div>
        </form>
      </FadeIn>

      {initialRequests.length === 0 ? (
        <Card className="py-16 text-center">
          <Inbox className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-foreground font-medium">No requests{statusFilter || categoryFilter || search ? ' match these filters' : ' yet'}</p>
          <p className="text-muted text-sm mt-1">Student support requests will appear here.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {initialRequests.map((req, i) => (
            <FadeIn key={req.id} delay={Math.min(i, 4) * 0.05}>
              <button type="button" onClick={() => router.push(`/admin/requests/${req.id}`)} className="w-full text-left cursor-pointer">
              <Card hover>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-foreground font-medium text-sm">{req.studentName}</p>
                      <span className="text-muted text-xs">{req.studentEmail}</span>
                      <span className="text-muted text-xs ml-auto">{formatDateShort(req.createdAt)}</span>
                    </div>
                    <p className="text-muted text-xs mt-0.5">
                      {requestCategoryLabel(req.category)}
                      {req.courseTitle ? ` · ${req.courseTitle}` : ''}
                    </p>
                    <p className="text-foreground/90 text-sm mt-1.5 truncate">{req.subject}</p>
                    <p className="text-muted text-sm mt-0.5 line-clamp-2">{req.message}</p>
                  </div>
                  <Badge variant={REQUEST_STATUS_BADGE[req.status as RequestStatus] ?? 'muted'}>
                    {requestStatusLabel(req.status)}
                  </Badge>
                </div>
              </Card>
              </button>
            </FadeIn>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => navigate({ page: page - 1 })}>
            <ChevronLeft className="w-4 h-4" />Previous
          </Button>
          <p className="text-muted text-xs">Page {page} of {totalPages}</p>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => navigate({ page: page + 1 })}>
            Next<ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
