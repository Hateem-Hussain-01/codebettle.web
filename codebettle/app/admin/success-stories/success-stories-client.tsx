'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import {
  SUCCESS_STORY_STATUSES,
  SUCCESS_STORY_STATUS_LABELS,
  type SuccessStoryStatus,
} from '@/lib/success-story-categories';
import type { SuccessStorySubmission } from '@/lib/db/types';
import { AlertTriangle, Eye, Search, Star, Trophy } from 'lucide-react';

const STATUS_BADGE: Record<SuccessStoryStatus, string> = {
  pending: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  under_review: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  approved: 'bg-green-500/10 text-green-300 border-green-500/30',
  rejected: 'bg-red-500/10 text-red-300 border-red-500/30',
};

interface ListResponse {
  submissions: SuccessStorySubmission[];
  total: number;
  tablesReady: boolean;
  error?: string;
}

export default function SuccessStoriesClient() {
  const [submissions, setSubmissions] = useState<SuccessStorySubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [tablesReady, setTablesReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'' | SuccessStoryStatus>('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // One unfiltered load (limit 100); status + search filtering happens
      // client-side so the per-status counts stay correct.
      const res = await fetch('/api/admin/success-stories?limit=100');
      const json = (await res.json()) as ListResponse;
      if (!res.ok) throw new Error(json.error ?? 'Could not load submissions');
      setSubmissions(json.submissions ?? []);
      setTotal(json.total ?? 0);
      setTablesReady(json.tablesReady !== false);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load submissions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return submissions.filter((s) => {
      if (statusFilter && s.status !== statusFilter) return false;
      if (!q) return true;
      return [s.fullName, s.email, s.submissionNumber, s.courseTitle]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q));
    });
  }, [submissions, statusFilter, search]);

  const counts = SUCCESS_STORY_STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = submissions.filter((x) => x.status === s).length;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary-text" /> Success Story Submissions
          </h1>
          <p className="text-sm text-muted mt-1">
            Review student success stories, approve the best ones for publication, and feature the
            most inspiring. Only approved stories appear on the public page.
          </p>
        </div>
        <Link href="/success-stories" target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm">
            <Eye className="w-4 h-4" /> View Public Page
          </Button>
        </Link>
      </div>

      {!tablesReady && (
        <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-300 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-yellow-300">Database setup needed</p>
            <p className="text-sm text-yellow-200/80 mt-1">
              The success story tables do not exist yet. Run{' '}
              <code className="bg-black/30 px-1.5 py-0.5 rounded text-xs">codebettle-success-story-migration.sql</code>{' '}
              in the Supabase SQL Editor — submissions will start appearing here afterwards. Nothing
              else on the site is affected.
            </p>
          </div>
        </div>
      )}

      {loadError && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4">
          <p className="text-sm font-bold text-red-400">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
            Try Again
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex flex-wrap gap-2">
          <FilterButton active={statusFilter === ''} onClick={() => setStatusFilter('')}>
            All ({total})
          </FilterButton>
          {SUCCESS_STORY_STATUSES.map((s) => (
            <FilterButton key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {SUCCESS_STORY_STATUS_LABELS[s]} ({counts[s] ?? 0})
            </FilterButton>
          ))}
        </div>
        <div className="sm:ml-auto sm:w-64">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, ID, course…"
            icon={<Search className="w-4 h-4" />}
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-dark-card border border-dark-border rounded-xl p-10 text-center text-muted">
          Loading submissions…
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-dark-card border border-dark-border rounded-xl p-10 text-center">
          <Trophy className="w-10 h-10 text-primary-text mx-auto mb-3" />
          <h2 className="text-lg font-bold text-foreground mb-1">No submissions yet</h2>
          <p className="text-sm text-muted max-w-md mx-auto">
            {statusFilter || search.trim()
              ? 'No submissions match this filter.'
              : 'No student has submitted a success story yet. Once they do, they will appear here for review.'}
          </p>
        </div>
      ) : (
        <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
          <div className="divide-y divide-dark-border">
            {visible.map((s) => (
              <Link key={s.id} href={`/admin/success-stories/${s.id}`}>
                <div className="flex items-center gap-4 px-5 py-4 hover:bg-primary/5 transition-colors cursor-pointer">
                  {s.profilePictureUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.profilePictureUrl}
                      alt={s.fullName}
                      className="w-12 h-12 rounded-full object-cover border border-primary/30 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                      <span className="text-lg font-black text-primary-text">{s.fullName.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-foreground truncate">{s.fullName}</span>
                      {s.featured && <Star className="w-4 h-4 text-primary-text fill-yellow-400" />}
                      <span className="text-xs text-muted">{s.submissionNumber}</span>
                    </div>
                    <p className="text-sm text-muted truncate">
                      {s.courseTitle}
                      {s.batchNumber ? ` · Batch ${s.batchNumber}` : ''}
                      {s.designation ? ` · ${s.designation}` : ''}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      {new Date(s.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}
                      {s.email}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${STATUS_BADGE[s.status]}`}
                  >
                    {SUCCESS_STORY_STATUS_LABELS[s.status]}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
        active
          ? 'bg-primary text-ink border-primary'
          : 'bg-dark-card text-muted border-dark-border hover:border-primary/40 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
