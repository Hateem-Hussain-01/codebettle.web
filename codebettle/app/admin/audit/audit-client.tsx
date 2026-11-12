'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ScrollText, ShieldCheck, ShieldAlert, UserPlus, Ban, RefreshCw, Inbox } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  AUDIT_PAGE_SIZE,
  EMPTY_AUDIT_FILTERS,
  auditGrantCandidates,
  auditPageNumbers,
  auditTotalPages,
  buildAuditQuery,
  clampAuditPage,
  formatAuditTimestamp,
  mergeActorOptions,
  type AuditAccessLists,
  type AuditActorOption,
  type AuditFilters,
  type AuditLogEntry,
} from '@/components/audit/audit-helpers';

/** One row of GET /api/admin/access/users (same shape the access page uses). */
interface AccessListUser {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'instructor' | 'admin';
  isAdmin?: boolean;
  isTeacher?: boolean;
}

/**
 * Audit log (Phase 5, Module 23).
 *
 * Entries load from GET /api/admin/audit — real data only, no
 * placeholder rows. The Access & Permissions section below the log is
 * rendered only when canManageAccess is true (authorized
 * administrators); everyone else who can view the log sees the log
 * alone. The server page and the admin layout enforce the same rules,
 * so hiding the section here is presentation, not the gate.
 */
export default function AuditClient({ canManageAccess }: { canManageAccess: boolean }) {
  // --- Audit log: filters + entries ---
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  /**
   * Actors seen on loaded entries, for the actor filter select. The
   * audit API filters `actor` by user id (not by name/email text), so
   * the filter is a select of known actors rather than a text search:
   * authorized administrators also get the full user list below, and
   * every viewer gets the actors of the entries already loaded.
   */
  const [seenActors, setSeenActors] = useState<AuditActorOption[]>([]);

  const totalPages = auditTotalPages(total, AUDIT_PAGE_SIZE);

  const loadEntries = useCallback(async (applied: AuditFilters, requestedPage: number) => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/admin/audit?${buildAuditQuery(applied, requestedPage)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not load the audit log');
      const loaded: AuditLogEntry[] = Array.isArray(data.entries) ? data.entries : [];
      setEntries(loaded);
      setSeenActors((prev) =>
        mergeActorOptions(
          prev,
          loaded
            .filter((e) => e.actorId)
            .map((e) => ({ id: e.actorId as string, name: e.actorName ?? '', email: e.actorEmail ?? '' })),
        ),
      );
      setTotal(typeof data.total === 'number' ? data.total : 0);
      setPage(clampAuditPage(typeof data.page === 'number' ? data.page : requestedPage, auditTotalPages(typeof data.total === 'number' ? data.total : 0, AUDIT_PAGE_SIZE)));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the audit log');
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntries(filters, page);
    // Page changes go through setPage (pager / filter reset), which
    // re-runs this effect; the refresh button calls loadEntries
    // directly. If a fetch lands on an out-of-range page (the log
    // shrank), loadEntries clamps the page, which re-runs the effect
    // once with the valid page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page]);

  const applyFilters = (next: Partial<AuditFilters>) => {
    const applied = { ...filters, ...next };
    setFilters(applied);
    setPage(1);
  };

  const goToPage = (nextPage: number) => {
    setPage(clampAuditPage(nextPage, totalPages));
  };

  const shownFrom = total === 0 ? 0 : (page - 1) * AUDIT_PAGE_SIZE + 1;
  const shownTo = Math.min(total, page * AUDIT_PAGE_SIZE);

  // --- Access & Permissions (authorized administrators only) ---
  const [accessLists, setAccessLists] = useState<AuditAccessLists>({ officials: [], granted: [] });
  const [accessUsers, setAccessUsers] = useState<AccessListUser[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [grantUserId, setGrantUserId] = useState('');
  const [granting, setGranting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadAccess = useCallback(async () => {
    setAccessLoading(true);
    setAccessError('');
    try {
      const [accessRes, usersRes] = await Promise.all([
        fetch('/api/admin/audit/access'),
        fetch('/api/admin/access/users'),
      ]);
      const accessData = await accessRes.json().catch(() => ({}));
      if (!accessRes.ok) throw new Error(accessData.error ?? 'Could not load access lists');
      setAccessLists({
        officials: Array.isArray(accessData.officials) ? accessData.officials : [],
        granted: Array.isArray(accessData.granted) ? accessData.granted : [],
      });
      const usersData = await usersRes.json().catch(() => ({}));
      if (usersRes.ok) setAccessUsers(Array.isArray(usersData.users) ? usersData.users : []);
    } catch (e) {
      setAccessError(e instanceof Error ? e.message : 'Could not load access lists');
    } finally {
      setAccessLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManageAccess) loadAccess();
  }, [canManageAccess, loadAccess]);

  const authorizedIds = useMemo(
    () => [...accessLists.officials, ...accessLists.granted].map((p) => p.id),
    [accessLists],
  );
  const candidates = useMemo(
    () => auditGrantCandidates(accessUsers, authorizedIds),
    [accessUsers, authorizedIds],
  );

  /**
   * Actor filter options: the full user list when it loaded (authorized
   * administrators — GET /api/admin/access/users) plus every actor seen
   * on loaded entries (every viewer). Merged and deduped.
   */
  const actorOptions = useMemo(
    () =>
      mergeActorOptions(
        seenActors,
        accessUsers.map((u) => ({ id: u.id, name: u.name, email: u.email })),
      ),
    [seenActors, accessUsers],
  );

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantUserId) {
      toast.error('Choose a person to grant access to');
      return;
    }
    setGranting(true);
    try {
      const res = await fetch('/api/admin/audit/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: grantUserId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not grant access');
      toast.success(`${data.user?.name ?? 'Access'} granted — they can now open the audit log`);
      setGrantUserId('');
      await loadAccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not grant access');
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = async (person: { id: string; name: string }) => {
    if (!window.confirm(`Revoke audit log access for ${person.name}? They will no longer be able to open the audit log. Their account and admin access are NOT affected.`)) return;
    setRevokingId(person.id);
    try {
      const res = await fetch(`/api/admin/audit/access/${person.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not revoke access');
      toast.success(`Audit log access revoked for ${person.name}`);
      await loadAccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not revoke access');
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-white flex items-center gap-2">
          <ScrollText className="w-6 h-6 text-primary" /> Audit Log
        </h1>
        <p className="text-muted text-sm mt-1">
          A record of privileged actions on the platform — who did what, when. Entries are
          never edited or deleted. {total > 0 && `${total} ${total === 1 ? 'entry' : 'entries'} found.`}
        </p>
      </FadeIn>

      {/* Filters — every control applies immediately and resets to page 1. */}
      <FadeIn delay={0.03}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Select
                label="Actor"
                options={[
                  { value: '', label: 'All actors' },
                  ...actorOptions.map((a) => ({
                    value: a.id,
                    label: a.email ? `${a.name} (${a.email})` : a.name,
                  })),
                ]}
                value={filters.actor}
                onChange={(e) => applyFilters({ actor: e.target.value })}
              />
            </div>
            <div className="sm:w-56">
              <Select
                label="Action"
                options={[
                  { value: '', label: 'All actions' },
                  ...AUDIT_ACTIONS.map((a) => ({ value: a, label: a })),
                ]}
                value={filters.action}
                onChange={(e) => applyFilters({ action: e.target.value })}
              />
            </div>
            <div className="sm:w-48">
              <Select
                label="Entity"
                options={[
                  { value: '', label: 'All entities' },
                  ...AUDIT_ENTITIES.map((en) => ({ value: en, label: en })),
                ]}
                value={filters.entity}
                onChange={(e) => applyFilters({ entity: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="sm:w-52">
              <Input
                label="From date"
                type="date"
                value={filters.from}
                onChange={(e) => applyFilters({ from: e.target.value })}
              />
            </div>
            <div className="sm:w-52">
              <Input
                label="To date"
                type="date"
                value={filters.to}
                onChange={(e) => applyFilters({ to: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setFilters(EMPTY_AUDIT_FILTERS);
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => loadEntries(filters, page)}>
                <RefreshCw className="w-4 h-4" /> Refresh
              </Button>
            </div>
          </div>
        </div>
      </FadeIn>

      {/* Entries */}
      <FadeIn delay={0.05}>
        <Card>
          {loading && <p className="text-muted text-sm py-8 text-center">Loading audit entries…</p>}
          {!loading && loadError && (
            <div className="py-8 text-center">
              <p className="text-red-400 text-sm">{loadError}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => loadEntries(filters, page)}>
                Try again
              </Button>
            </div>
          )}
          {!loading && !loadError && entries.length === 0 && (
            <div className="py-16 text-center">
              <Inbox className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-white font-medium">
                No audit entries{filters.actor || filters.action || filters.entity || filters.from || filters.to ? ' match these filters' : ' yet'}
              </p>
              <p className="text-muted text-sm mt-1">Privileged actions will appear here as they happen.</p>
            </div>
          )}
          {!loading && !loadError && entries.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-border bg-dark-border/20">
                    {['Time', 'Actor', 'Action', 'Entity', 'Entity ID', 'Detail'].map((h) => (
                      <th key={h} className="text-left text-muted text-xs py-3 px-4 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-b border-dark-border/40 last:border-0 hover:bg-dark-border/10 align-top">
                      <td className="py-3 px-4 text-muted text-xs whitespace-nowrap">
                        {formatAuditTimestamp(entry.createdAt)}
                        {entry.ip && <span className="block text-muted/70">{entry.ip}</span>}
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-white text-xs font-medium">{entry.actorName ?? 'Unknown actor'}</p>
                        {entry.actorEmail && <p className="text-muted text-xs truncate max-w-52">{entry.actorEmail}</p>}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="info">{entry.action}</Badge>
                      </td>
                      <td className="py-3 px-4 text-white text-xs">{entry.entity}</td>
                      <td className="py-3 px-4 text-muted text-xs font-mono break-all max-w-40">
                        {entry.entityId ?? '—'}
                      </td>
                      <td className="py-3 px-4 text-muted text-xs max-w-xs break-words">
                        {entry.detail ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </FadeIn>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-muted text-xs">
            Showing {shownFrom}–{shownTo} of {total} entries
          </p>
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
              <ChevronLeft className="w-4 h-4" /> Previous
            </Button>
            {auditPageNumbers(page, totalPages).map((p, i) =>
              p === '…' ? (
                <span key={`gap-${i}`} className="text-muted text-xs px-1">…</span>
              ) : (
                <Button
                  key={p}
                  variant={p === page ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => goToPage(p)}
                >
                  {p}
                </Button>
              ),
            )}
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-muted text-xs">Page {page} of {totalPages}</p>
        </div>
      )}
      {totalPages === 1 && total > 0 && (
        <p className="text-muted text-xs">Showing {shownFrom}–{shownTo} of {total} entries</p>
      )}

      {/* Access & Permissions — authorized administrators only. */}
      {canManageAccess && (
        <FadeIn delay={0.08}>
          <Card>
            <h2 className="text-white font-bold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" /> Access &amp; Permissions
            </h2>
            <p className="text-muted text-sm mt-1">
              Choose who else can open this audit log. Access here is separate from admin
              areas: it only opens the audit log, and it never changes anyone&apos;s account
              or admin access.
            </p>

            {accessLoading && <p className="text-muted text-sm mt-4">Loading access lists…</p>}
            {accessError && <p className="text-red-400 text-sm mt-4">{accessError}</p>}

            {!accessLoading && !accessError && (
              <div className="mt-4 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" /> Authorized administrators
                  </h3>
                  {accessLists.officials.length === 0 ? (
                    <p className="text-muted text-sm mt-2">No authorized administrators found.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {accessLists.officials.map((person) => (
                        <div key={person.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dark-border px-4 py-3">
                          <div>
                            <p className="text-sm font-semibold text-white">{person.name}</p>
                            <p className="text-xs text-muted">{person.email}</p>
                          </div>
                          <Badge variant="primary">Always authorized</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-bold text-white">Granted access</h3>
                  {accessLists.granted.length === 0 ? (
                    <p className="text-muted text-sm mt-2">Nobody else has audit log access yet. Use the form below to grant it.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {accessLists.granted.map((person) => (
                        <div key={person.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dark-border px-4 py-3">
                          <div>
                            <p className="text-sm font-semibold text-white">{person.name}</p>
                            <p className="text-xs text-muted">{person.email}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleRevoke(person)}
                            loading={revokingId === person.id}
                            disabled={revokingId !== null}
                          >
                            <Ban className="w-4 h-4" /> Revoke
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <form onSubmit={handleGrant} className="border-t border-dark-border pt-4 space-y-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-primary" /> Grant access
                  </h3>
                  {candidates.length === 0 ? (
                    <p className="text-muted text-sm flex items-center gap-1">
                      <ShieldAlert className="w-4 h-4" />
                      No other admins are available to grant — everyone with admin access already has it.
                    </p>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                      <div className="flex-1">
                        <Select
                          label="Admin"
                          options={[
                            { value: '', label: 'Choose a person…' },
                            ...candidates.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` })),
                          ]}
                          value={grantUserId}
                          onChange={(e) => setGrantUserId(e.target.value)}
                        />
                      </div>
                      <Button type="submit" loading={granting} disabled={granting || !grantUserId}>
                        <UserPlus className="w-4 h-4" /> Grant access
                      </Button>
                    </div>
                  )}
                </form>
              </div>
            )}
          </Card>
        </FadeIn>
      )}
    </div>
  );
}
