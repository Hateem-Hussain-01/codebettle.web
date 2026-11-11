'use client';
import { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import { Search, ShieldCheck, ShieldAlert, Save, Ban } from 'lucide-react';
import toast from 'react-hot-toast';
import { ADMIN_AREAS, type AdminAreaKey, type AdminPermissions } from '@/lib/admin-access';
import { hasAdminCapability } from '@/lib/rbac';

interface AccessUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'student' | 'instructor' | 'admin';
  /** Phase 2 flags (SafeUser carries both). */
  isAdmin?: boolean;
  isTeacher?: boolean;
  status: 'active' | 'suspended';
  adminPermissions?: AdminPermissions;
}

function isFullAdminUser(user: AccessUser): boolean {
  // Phase 2: full admin = admin capability (flag or legacy role) with no permissions restriction.
  return hasAdminCapability(user) && user.adminPermissions === undefined;
}

function grantedCount(user: AccessUser): number {
  if (!hasAdminCapability(user)) return 0;
  if (isFullAdminUser(user)) return ADMIN_AREAS.length;
  return ADMIN_AREAS.filter((a) => user.adminPermissions?.[a.key] === true).length;
}

function accessSummary(user: AccessUser): string {
  if (!hasAdminCapability(user)) return 'No admin access';
  if (isFullAdminUser(user)) return 'Full admin — all areas';
  const n = grantedCount(user);
  return n === 0 ? 'Admin — no areas granted' : `Restricted admin — ${n} of ${ADMIN_AREAS.length} areas`;
}

export default function AdminAccessClient() {
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<AdminAreaKey, boolean>>(
    () => Object.fromEntries(ADMIN_AREAS.map((a) => [a.key, false])) as Record<AdminAreaKey, boolean>,
  );
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const selected = users.find((u) => u.id === selectedId) ?? null;

  const loadUsers = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/admin/access/users');
      if (!res.ok) throw new Error('Could not load users');
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      setLoadError('Could not load users. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) => u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term));
  }, [users, search]);

  const selectUser = (user: AccessUser) => {
    setSelectedId(user.id);
    const next = {} as Record<AdminAreaKey, boolean>;
    for (const area of ADMIN_AREAS) {
      next[area.key] = hasAdminCapability(user)
        ? (isFullAdminUser(user) ? true : user.adminPermissions?.[area.key] === true)
        : false;
    }
    setChecks(next);
  };

  const checkedCount = ADMIN_AREAS.filter((a) => checks[a.key]).length;

  const handleSave = async () => {
    if (!selected) return;
    if (checkedCount === 0) {
      toast.error('Select at least one admin area to grant');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/access/users/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: checks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not save admin access');
      toast.success(
        checkedCount === ADMIN_AREAS.length
          ? `${selected.name} now has full admin access`
          : `${selected.name} now has access to ${checkedCount} area${checkedCount === 1 ? '' : 's'}`,
      );
      await loadUsers();
      selectUser(data.user as AccessUser);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save admin access');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async () => {
    if (!selected) return;
    if (!window.confirm(`Revoke admin access for ${selected.name}? They will return to a student account and be signed out of the admin portal.`)) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/admin/access/users/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revoke: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not revoke admin access');
      toast.success(`Admin access revoked for ${selected.name}`);
      await loadUsers();
      selectUser(data.user as AccessUser);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not revoke admin access');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-white flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" /> Admin Access
        </h1>
        <p className="text-muted text-sm mt-1">
          Give someone admin access and choose exactly which areas they can open.
          Only full admins can use this page. Changes apply on the user&apos;s next request.
          You cannot change your own access.
        </p>
      </FadeIn>

      <div className="grid gap-6 lg:grid-cols-2">
        <FadeIn delay={0.05}>
          <Card>
            <Input
              label="Find a user"
              placeholder="Search by name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search className="w-4 h-4" />}
            />
            <div className="mt-4 space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {loading && <p className="text-muted text-sm">Loading users…</p>}
              {loadError && <p className="text-red-400 text-sm">{loadError}</p>}
              {!loading && !loadError && filtered.length === 0 && (
                <p className="text-muted text-sm">No users match that search.</p>
              )}
              {filtered.map((user) => {
                const active = user.id === selectedId;
                return (
                  <button
                    key={user.id}
                    onClick={() => selectUser(user)}
                    className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                      active ? 'border-primary/60 bg-primary/10' : 'border-dark-border hover:border-primary/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white truncate">{user.name}</p>
                      <Badge variant={user.role === 'admin' ? 'primary' : 'muted'}>{user.role}</Badge>
                    </div>
                    <p className="text-xs text-muted truncate">{user.email}</p>
                    <p className="text-xs text-muted mt-1 flex items-center gap-1">
                      {hasAdminCapability(user)
                        ? <ShieldCheck className="w-3 h-3 text-primary" />
                        : <ShieldAlert className="w-3 h-3" />}
                      {accessSummary(user)}
                      {user.status === 'suspended' && ' — suspended'}
                    </p>
                  </button>
                );
              })}
            </div>
          </Card>
        </FadeIn>

        <FadeIn delay={0.1}>
          <Card>
            {!selected && (
              <p className="text-muted text-sm">Select a user on the left to grant or change their admin access.</p>
            )}
            {selected && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-white font-bold">{selected.name}</h2>
                  <p className="text-muted text-sm">{selected.email}</p>
                  <p className="text-muted text-xs mt-1">{accessSummary(selected)}</p>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setChecks(Object.fromEntries(ADMIN_AREAS.map((a) => [a.key, true])) as Record<AdminAreaKey, boolean>)}
                  >
                    Grant all areas (full admin)
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setChecks(Object.fromEntries(ADMIN_AREAS.map((a) => [a.key, false])) as Record<AdminAreaKey, boolean>)}
                  >
                    Clear all
                  </Button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {ADMIN_AREAS.map((area) => (
                    <label
                      key={area.key}
                      className="flex items-start gap-2 rounded-lg border border-dark-border px-3 py-2 cursor-pointer hover:border-primary/30"
                    >
                      <input
                        type="checkbox"
                        checked={checks[area.key]}
                        onChange={(e) => setChecks((c) => ({ ...c, [area.key]: e.target.checked }))}
                        className="mt-1 accent-[#F5C518]"
                      />
                      <span>
                        <span className="block text-sm font-medium text-white">{area.label}</span>
                        <span className="block text-xs text-muted">{area.description}</span>
                      </span>
                    </label>
                  ))}
                </div>

                <p className="text-xs text-muted">
                  {checkedCount === ADMIN_AREAS.length
                    ? 'All areas checked — saving grants full admin access.'
                    : `${checkedCount} of ${ADMIN_AREAS.length} areas selected.`}
                </p>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleSave} loading={saving} disabled={saving || checkedCount === 0}>
                    <Save className="w-4 h-4" /> Save admin access
                  </Button>
                  {selected && hasAdminCapability(selected) && (
                    <Button variant="danger" onClick={handleRevoke} loading={revoking} disabled={revoking}>
                      <Ban className="w-4 h-4" /> Revoke admin access
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>
        </FadeIn>
      </div>
    </div>
  );
}
