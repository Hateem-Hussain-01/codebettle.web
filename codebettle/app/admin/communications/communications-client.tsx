'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import { Bell, BookOpen, ChevronDown, ChevronUp, GraduationCap, Inbox, Megaphone, Plus, Search, Send, Users } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import CommunicationsStats from '@/components/admin/CommunicationsStats';
import ReceiptsTable, { ReceiptStatusTick } from '@/components/admin/ReceiptsTable';
import {
  computeReceiptSummary,
  matchesQuery,
  OPEN_SUPPORT_REQUEST_STATUSES,
  summariseRequests,
  type CommunicationsStats as Stats,
  type EnrichedAnnouncement,
  type ReceiptSummary,
  type TargetedRow,
} from './communications-helpers';
import { SUPPORT_REQUEST_CATEGORY_LABELS } from '@/lib/db/types';

/**
 * Admin communications dashboard — client (Phase 3, Module 14).
 *
 * READ/AGGREGATE ONLY. Every tab reads data Worker A/B/C (or the
 * existing repos) create; nothing here sends, stores or duplicates a
 * notification, announcement or request. Every row links to its source
 * (announcements page, receipts endpoint data, request queue) instead
 * of duplicating the detail UI.
 *
 * Tabs:
 * 1. General — site-wide announcements (admin + teacher authored).
 * 2. Teachers — admin-composed targeted notifications to teachers.
 * 3. Students — admin-composed targeted notifications to students.
 * 4. Teacher announcements — teacher-authored announcements (course +
 *    site-wide) with receipts. This is how an admin monitors
 *    teacher-generated notifications: origin = announcement author.
 * 5. Teacher targeted — teacher-authored COURSE announcements, i.e. the
 *    teacher's targeted messages to their enrolled students, with
 *    receipts. See the header note in communications-helpers.ts for why
 *    non-announcement teacher-targeted sends cannot be listed: a
 *    Notification row carries no sender.
 * 6. Requests — summary counts by status + category from Worker C's
 *    GET /api/admin/requests, linking to the full queue. The queue
 *    itself is NOT re-implemented here.
 * 7. Receipts — pick any announcement and see its per-recipient
 *    delivered / read / acknowledged table (Worker A's endpoint).
 *
 * All lists are newest first with timestamps — that IS the history view.
 * Receipts and the request summary are fetched lazily and degrade to an
 * explicit "not available yet" state while Workers A/C land their
 * endpoints; the dashboard never invents rows to fill the gap.
 *
 * Compose links: announcements are created on /admin/announcements;
 * targeted sends are composed on Worker B's page at
 * /admin/notifications/compose (live on this branch).
 */
const COMPOSE_NOTIFICATIONS_HREF = '/admin/notifications/compose';

type TabId = 'general' | 'teachers' | 'students' | 'teacher-announcements' | 'teacher-targeted' | 'requests' | 'receipts';

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General announcements' },
  { id: 'teachers', label: 'To teachers' },
  { id: 'students', label: 'To students' },
  { id: 'teacher-announcements', label: 'Teacher announcements' },
  { id: 'teacher-targeted', label: 'Teacher → students' },
  { id: 'requests', label: 'Requests' },
  { id: 'receipts', label: 'Read receipts' },
];

type ReceiptState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; summary: ReceiptSummary }
  | { status: 'unavailable' };

/**
 * One support request as Worker C's GET /api/admin/requests returns it
 * (SupportRequest). The list carries NO student name/email — only
 * studentId — so this tab shows subject/category/status/date and links
 * to the full queue for the detail (including the requester and replies).
 */
interface RequestRow {
  id: string;
  studentId: string;
  category: string;
  subject: string;
  message?: string;
  status: string;
  createdAt: string;
}

export default function CommunicationsClient({
  announcements,
  targeted,
  stats,
}: {
  announcements: EnrichedAnnouncement[];
  targeted: TargetedRow[];
  stats: Stats;
}) {
  const [tab, setTab] = useState<TabId>('general');
  const [query, setQuery] = useState('');
  const [originFilter, setOriginFilter] = useState<'all' | 'admin' | 'teacher'>('all');
  const [receipts, setReceipts] = useState<Record<string, ReceiptState>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [receiptsPickId, setReceiptsPickId] = useState<string>('');

  // Requests summary (Worker C) — fetched lazily, never faked.
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [requestsTotal, setRequestsTotal] = useState(0);
  const [requestsState, setRequestsState] = useState<'idle' | 'loading' | 'loaded' | 'unavailable'>('idle');
  const [requestStatusFilter, setRequestStatusFilter] = useState('all');
  const [requestCategoryFilter, setRequestCategoryFilter] = useState('all');

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setRequestsState('loading');
      try {
        const res = await fetch('/api/admin/requests');
        if (!res.ok) {
          if (!cancelled) setRequestsState('unavailable');
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setRequests(Array.isArray(data.requests) ? data.requests : []);
        setRequestsTotal(typeof data.total === 'number' ? data.total : (data.requests ?? []).length);
        setRequestsState('loaded');
      } catch {
        if (!cancelled) setRequestsState('unavailable');
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const loadReceipts = async (announcementId: string) => {
    const current = receipts[announcementId];
    if (current?.status === 'loading' || current?.status === 'loaded') return;
    setReceipts((m) => ({ ...m, [announcementId]: { status: 'loading' } }));
    try {
      const res = await fetch(`/api/admin/announcements/${announcementId}/receipts`);
      if (!res.ok) {
        setReceipts((m) => ({ ...m, [announcementId]: { status: 'unavailable' } }));
        return;
      }
      const data = await res.json().catch(() => ({}));
      const summary: ReceiptSummary = {
        total: typeof data.total === 'number' ? data.total : (data.recipients ?? []).length,
        read: typeof data.read === 'number' ? data.read : 0,
        acknowledged: typeof data.acknowledged === 'number' ? data.acknowledged : 0,
        recipients: Array.isArray(data.recipients) ? data.recipients : [],
      };
      setReceipts((m) => ({ ...m, [announcementId]: { status: 'loaded', summary } }));
    } catch {
      setReceipts((m) => ({ ...m, [announcementId]: { status: 'unavailable' } }));
    }
  };

  const toggleReceipts = (announcementId: string) => {
    if (expandedId === announcementId) {
      setExpandedId(null);
    } else {
      setExpandedId(announcementId);
      loadReceipts(announcementId);
    }
  };

  const general = useMemo(
    () =>
      announcements.filter(
        (e) =>
          e.announcement.type === 'site-wide' &&
          (originFilter === 'all' || e.origin === originFilter) &&
          matchesQuery(
            [e.announcement.title, e.announcement.content, e.authorName],
            query,
          ),
      ),
    [announcements, originFilter, query],
  );

  const toTeachers = useMemo(
    () =>
      targeted.filter(
        (t) =>
          t.recipientRole === 'instructor' &&
          matchesQuery([t.notification.title, t.notification.body, t.recipientName, t.recipientEmail], query),
      ),
    [targeted, query],
  );

  const toStudents = useMemo(
    () =>
      targeted.filter(
        (t) =>
          t.recipientRole === 'student' &&
          matchesQuery([t.notification.title, t.notification.body, t.recipientName, t.recipientEmail], query),
      ),
    [targeted, query],
  );

  const teacherAnnouncements = useMemo(
    () =>
      announcements.filter(
        (e) =>
          e.origin === 'teacher' &&
          matchesQuery([e.announcement.title, e.announcement.content, e.authorName, e.courseTitle], query),
      ),
    [announcements, query],
  );

  const teacherTargeted = useMemo(
    () =>
      announcements.filter(
        (e) =>
          e.origin === 'teacher' &&
          e.announcement.type === 'course' &&
          matchesQuery([e.announcement.title, e.announcement.content, e.authorName, e.courseTitle], query),
      ),
    [announcements, query],
  );

  const requestSummary = useMemo(() => summariseRequests(requests), [requests]);
  const requestStatuses = useMemo(() => Object.keys(requestSummary.byStatus).sort(), [requestSummary]);
  const requestCategories = useMemo(() => Object.keys(requestSummary.byCategory).sort(), [requestSummary]);
  const filteredRequests = useMemo(
    () =>
      requests.filter(
        (r) =>
          (requestStatusFilter === 'all' || (r.status ?? 'unknown').toLowerCase() === requestStatusFilter) &&
          (requestCategoryFilter === 'all' || (r.category ?? 'other') === requestCategoryFilter) &&
          matchesQuery([r.subject, r.message, r.category], query),
      ),
    [requests, requestStatusFilter, requestCategoryFilter, query],
  );
  const openRequests =
    requestsState === 'loaded'
      ? requests.filter((r) => (OPEN_SUPPORT_REQUEST_STATUSES as readonly string[]).includes(r.status)).length
      : null;

  const receiptsPick = announcements.find((e) => e.announcement.id === receiptsPickId) ?? null;
  const receiptsPickState: ReceiptState | undefined = receiptsPickId ? receipts[receiptsPickId] : undefined;

  const renderAnnouncementCard = (entry: EnrichedAnnouncement, index: number) => {
    const state = receipts[entry.announcement.id];
    const summary = state?.status === 'loaded' ? computeReceiptSummary(state.summary) : null;
    return (
      <FadeIn key={entry.announcement.id} delay={Math.min(index, 4) * 0.05}>
        <Card hover>
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary-text flex items-center justify-center flex-shrink-0">
              {entry.announcement.type === 'course' ? <BookOpen className="w-5 h-5" /> : <Megaphone className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-foreground font-semibold text-sm">{entry.announcement.title}</p>
                <div className="flex items-center gap-2">
                  <Badge variant={entry.origin === 'teacher' ? 'info' : 'primary'}>
                    {entry.origin === 'teacher' ? 'Teacher' : 'Admin'}
                  </Badge>
                  <Badge variant={entry.announcement.isActive ? 'success' : 'muted'}>
                    {entry.announcement.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
              <p className="text-muted text-sm mt-1">{entry.announcement.content}</p>
              <p className="text-muted text-xs mt-2">
                By {entry.authorName}
                {entry.courseTitle ? ` · ${entry.courseTitle}` : ' · Site-wide'} ·{' '}
                {formatDateShort(entry.announcement.createdAt)} · {entry.recipientCount} recipient
                {entry.recipientCount === 1 ? '' : 's'}
                {summary ? ` · ${summary.read} read · ${summary.acknowledged} acknowledged` : ''}
              </p>
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <button
                  onClick={() => toggleReceipts(entry.announcement.id)}
                  className="inline-flex items-center gap-1 text-xs text-primary-text hover:underline cursor-pointer"
                >
                  {expandedId === entry.announcement.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {expandedId === entry.announcement.id ? 'Hide receipts' : 'Read receipts'}
                </button>
                <Link href="/admin/announcements" className="text-xs text-primary-text hover:underline">
                  View in Announcements →
                </Link>
              </div>
              {expandedId === entry.announcement.id && (
                <div className="mt-4 border-t border-dark-border pt-4">
                  <ReceiptsTable
                    recipients={state?.status === 'loaded' ? state.summary.recipients : []}
                    loading={state?.status === 'loading' || !state}
                    unavailable={state?.status === 'unavailable'}
                  />
                </div>
              )}
            </div>
          </div>
        </Card>
      </FadeIn>
    );
  };

  const renderTargetedList = (rows: TargetedRow[]) => {
    if (rows.length === 0) {
      return (
        <Card className="py-12 text-center">
          <Send className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-foreground font-semibold text-sm mb-1">No targeted notifications yet</p>
          <p className="text-muted text-xs">Admin-composed targeted sends will appear here once the compose page sends one.</p>
        </Card>
      );
    }
    return (
      <div className="space-y-3">
        {rows.map((row, i) => (
          <FadeIn key={row.notification.id} delay={Math.min(i, 4) * 0.05}>
            <Card hover>
              <div className="flex items-start gap-4 flex-wrap">
                <div className="w-9 h-9 rounded-full bg-primary/20 text-primary-text flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {row.recipientName.charAt(0) || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-semibold text-sm">{row.notification.title}</p>
                  <p className="text-muted text-sm mt-0.5">{row.notification.body}</p>
                  <p className="text-muted text-xs mt-2">
                    To {row.recipientName} ({row.recipientEmail}) · {formatDateShort(row.notification.createdAt)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <Badge variant="muted">{row.notification.type}</Badge>
                  <ReceiptStatusTick status={row.status} />
                </div>
              </div>
            </Card>
          </FadeIn>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-foreground">Communications</h1>
          <p className="text-muted text-sm mt-1">
            Announcements, targeted notifications, read receipts and request summaries — newest first (history view).
            This dashboard only reads; it never sends.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/admin/announcements">
            <Button variant="secondary" size="sm"><Plus className="w-4 h-4" />New announcement</Button>
          </Link>
          <Link href={COMPOSE_NOTIFICATIONS_HREF}>
            <Button size="sm"><Send className="w-4 h-4" />Compose notification</Button>
          </Link>
        </div>
      </FadeIn>

      <CommunicationsStats stats={stats} openRequests={openRequests} />

      {/* Global controls: search + role filter apply to the lists below. Recipient selection is NOT re-implemented here — composing lives on the compose page. */}
      <FadeIn className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-52">
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, recipient or category…"
            className="pl-9"
          />
        </div>
        {tab === 'general' && (
          <select
            value={originFilter}
            onChange={(e) => setOriginFilter(e.target.value as 'all' | 'admin' | 'teacher')}
            aria-label="Filter by author"
            className="bg-dark-card border border-dark-border rounded-md px-2 py-2 text-xs text-foreground cursor-pointer"
          >
            <option value="all">All authors</option>
            <option value="admin">Admin-authored</option>
            <option value="teacher">Teacher-authored</option>
          </select>
        )}
      </FadeIn>

      <FadeIn className="flex gap-1 bg-dark-card border border-dark-border rounded-lg p-1 w-fit max-w-full overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
              tab === t.id ? 'bg-primary text-ink' : 'text-muted hover:text-foreground'
            }`}
          >
            {t.label}
            {t.id === 'general' ? ` (${stats.siteWideAnnouncements})` : ''}
            {t.id === 'teachers' ? ` (${toTeachers.length})` : ''}
            {t.id === 'students' ? ` (${toStudents.length})` : ''}
            {t.id === 'teacher-announcements' ? ` (${teacherAnnouncements.length})` : ''}
            {t.id === 'teacher-targeted' ? ` (${teacherTargeted.length})` : ''}
            {t.id === 'requests' ? (requestsState === 'loaded' ? ` (${requestsTotal})` : '') : ''}
          </button>
        ))}
      </FadeIn>

      {tab === 'general' && (
        <div className="space-y-3">
          {general.length === 0 ? (
            <Card className="py-12 text-center">
              <Bell className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-foreground font-semibold text-sm">No site-wide announcements</p>
            </Card>
          ) : (
            general.map((entry, i) => renderAnnouncementCard(entry, i))
          )}
        </div>
      )}

      {tab === 'teachers' && (
        <div>
          <p className="text-muted text-xs mb-3 flex items-center gap-1.5">
            <GraduationCap className="w-3.5 h-3.5" /> Admin-composed targeted notifications sent to teachers.
            Announcement deliveries (announcementId set) and system notifications (enrolment, completion,
            certificate, application, payment, support request) are excluded.
          </p>
          {renderTargetedList(toTeachers)}
        </div>
      )}

      {tab === 'students' && (
        <div>
          <p className="text-muted text-xs mb-3 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Admin-composed targeted notifications sent to students.
            Announcement deliveries (announcementId set) and system notifications (enrolment, completion,
            certificate, application, payment, support request) are excluded.
          </p>
          {renderTargetedList(toStudents)}
        </div>
      )}

      {tab === 'teacher-announcements' && (
        <div>
          <p className="text-muted text-xs mb-3">
            Teacher-generated announcements (course + site-wide), identified by the announcement&apos;s author.
            Expand any row for its read receipts — this is how teacher-generated notifications are monitored.
          </p>
          {teacherAnnouncements.length === 0 ? (
            <Card className="py-12 text-center">
              <GraduationCap className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-foreground font-semibold text-sm">No teacher-authored announcements yet</p>
            </Card>
          ) : (
            <div className="space-y-3">{teacherAnnouncements.map((entry, i) => renderAnnouncementCard(entry, i))}</div>
          )}
        </div>
      )}

      {tab === 'teacher-targeted' && (
        <div>
          <p className="text-muted text-xs mb-3">
            Teacher-generated targeted messages to students = teacher-authored course announcements, delivered to the
            enrolled students of that course. A Notification row carries no sender, and teacher-targeted sends can
            only be composed by admins — so non-announcement teacher-targeted sends do not exist to list.
          </p>
          {teacherTargeted.length === 0 ? (
            <Card className="py-12 text-center">
              <GraduationCap className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-foreground font-semibold text-sm">No teacher course announcements yet</p>
            </Card>
          ) : (
            <div className="space-y-3">{teacherTargeted.map((entry, i) => renderAnnouncementCard(entry, i))}</div>
          )}
        </div>
      )}

      {tab === 'requests' && (
        <div className="space-y-4">
          <p className="text-muted text-xs">
            Student complaints / requests — summary only. The full queue lives on Worker C&apos;s page; this tab never
            re-implements it.
          </p>
          {requestsState === 'loading' && <p className="text-muted text-sm">Loading request summary…</p>}
          {requestsState === 'unavailable' && (
            <Card className="py-8 text-center">
              <Inbox className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-foreground font-semibold text-sm mb-1">Request queue is not available yet</p>
              <p className="text-muted text-xs mb-3">
                GET /api/admin/requests is still being built (Worker C) — this summary will fill in once it lands.
              </p>
              <Link href="/admin/requests" className="text-xs text-primary-text hover:underline">
                Open the request queue →
              </Link>
            </Card>
          )}
          {requestsState === 'loaded' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card>
                  <p className="text-muted text-xs">Total requests</p>
                  <p className="text-foreground text-2xl font-bold mt-1">{requestSummary.total}</p>
                </Card>
                {Object.entries(requestSummary.byStatus).map(([status, count]) => (
                  <Card key={status}>
                    <p className="text-muted text-xs capitalize">{status}</p>
                    <p className="text-foreground text-2xl font-bold mt-1">{count}</p>
                  </Card>
                ))}
              </div>
              <Card>
                <h2 className="text-foreground font-semibold text-sm mb-2">By category</h2>
                {Object.keys(requestSummary.byCategory).length === 0 ? (
                  <p className="text-muted text-xs">No categories yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {Object.entries(requestSummary.byCategory).map(([category, count]) => (
                      <li key={category} className="flex justify-between text-sm">
                        <span className="text-muted">
                          {SUPPORT_REQUEST_CATEGORY_LABELS[
                            category as keyof typeof SUPPORT_REQUEST_CATEGORY_LABELS
                          ] ?? category}
                        </span>
                        <span className="text-foreground font-medium">{count}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href="/admin/requests" className="inline-block mt-3 text-xs text-primary-text hover:underline">
                  Open the full request queue →
                </Link>
              </Card>
              <div className="flex gap-2 flex-wrap items-center">
                <select
                  value={requestStatusFilter}
                  onChange={(e) => setRequestStatusFilter(e.target.value)}
                  aria-label="Filter requests by status"
                  className="bg-dark-card border border-dark-border rounded-md px-2 py-2 text-xs text-foreground cursor-pointer"
                >
                  <option value="all">All statuses</option>
                  {requestStatuses.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select
                  value={requestCategoryFilter}
                  onChange={(e) => setRequestCategoryFilter(e.target.value)}
                  aria-label="Filter requests by category"
                  className="bg-dark-card border border-dark-border rounded-md px-2 py-2 text-xs text-foreground cursor-pointer"
                >
                  <option value="all">All categories</option>
                  {requestCategories.map((c) => (
                    <option key={c} value={c}>
                      {SUPPORT_REQUEST_CATEGORY_LABELS[c as keyof typeof SUPPORT_REQUEST_CATEGORY_LABELS] ?? c}
                    </option>
                  ))}
                </select>
              </div>
              {filteredRequests.length === 0 ? (
                <p className="text-muted text-sm">No requests match these filters.</p>
              ) : (
                <div className="space-y-3">
                  {filteredRequests.map((request) => (
                    <Card key={request.id} hover>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <p className="text-foreground font-semibold text-sm">{request.subject}</p>
                          {request.message && (
                            <p className="text-muted text-xs mt-1 line-clamp-2">{request.message}</p>
                          )}
                          <p className="text-muted text-xs mt-1">
                            {formatDateShort(request.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="info">
                            {SUPPORT_REQUEST_CATEGORY_LABELS[
                              request.category as keyof typeof SUPPORT_REQUEST_CATEGORY_LABELS
                            ] ?? request.category}
                          </Badge>
                          <Badge variant="muted">{request.status.replaceAll('_', ' ')}</Badge>
                          <Link href="/admin/requests" className="text-xs text-primary-text hover:underline">
                            Open in queue →
                          </Link>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'receipts' && (
        <div className="space-y-4">
          <p className="text-muted text-xs">
            Pick any announcement to see every recipient with delivered (✓), read (✓✓) or acknowledged (✓✓ yellow)
            status, from the receipts endpoint. Acknowledged only appears when the endpoint reports it.
          </p>
          <select
            value={receiptsPickId}
            onChange={(e) => {
              setReceiptsPickId(e.target.value);
              if (e.target.value) loadReceipts(e.target.value);
            }}
            aria-label="Pick an announcement for receipts"
            className="w-full bg-dark-card border border-dark-border rounded-md px-3 py-2 text-sm text-foreground cursor-pointer"
          >
            <option value="">Pick an announcement…</option>
            {announcements.map((e) => (
              <option key={e.announcement.id} value={e.announcement.id}>
                {e.announcement.title} — {formatDateShort(e.announcement.createdAt)}
              </option>
            ))}
          </select>
          {receiptsPick && (
            <Card>
              <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                <div>
                  <p className="text-foreground font-semibold text-sm">{receiptsPick.announcement.title}</p>
                  <p className="text-muted text-xs mt-0.5">
                    By {receiptsPick.authorName} · {formatDateShort(receiptsPick.announcement.createdAt)} ·{' '}
                    {receiptsPick.recipientCount} recipients
                    {receiptsPickState?.status === 'loaded'
                      ? ` · ${computeReceiptSummary(receiptsPickState.summary).read} read · ${
                          computeReceiptSummary(receiptsPickState.summary).acknowledged
                        } acknowledged`
                      : ''}
                  </p>
                </div>
                <Badge variant="muted">
                  {receiptsPick.origin === 'teacher' ? 'Teacher-authored' : 'Admin-authored'}
                </Badge>
              </div>
              <ReceiptsTable
                recipients={receiptsPickState?.status === 'loaded' ? receiptsPickState.summary.recipients : []}
                loading={receiptsPickState?.status === 'loading' || !receiptsPickState}
                unavailable={receiptsPickState?.status === 'unavailable'}
              />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
