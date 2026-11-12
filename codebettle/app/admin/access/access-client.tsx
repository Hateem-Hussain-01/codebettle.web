'use client';
import { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import { Search, ShieldCheck, ShieldAlert, Save, Ban, UserPlus, Mail, Copy, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { ADMIN_AREAS, type AdminAreaKey, type AdminPermissions } from '@/lib/admin-access';
import { hasAdminCapability } from '@/lib/rbac';

interface AccessUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  phone?: string;
  role: 'student' | 'instructor' | 'admin';
  /** Phase 2 flags (SafeUser carries both). */
  isAdmin?: boolean;
  isTeacher?: boolean;
  status: 'active' | 'suspended';
  adminPermissions?: AdminPermissions;
}

/** One row of the admin invitations list (Module 18). No token hash is ever returned. */
interface AdminInvitation {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  contactNumber?: string;
  expiresAt: string;
  usedAt: string | null;
  status: 'pending' | 'used' | 'expired';
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

  // --- Module 18: invitations + basic-details / status editing ---
  const [invitations, setInvitations] = useState<AdminInvitation[]>([]);
  const [invitationsError, setInvitationsError] = useState('');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteContact, setInviteContact] = useState('');
  const [inviteIsTeacher, setInviteIsTeacher] = useState(false);
  const [inviteChecks, setInviteChecks] = useState<Record<AdminAreaKey, boolean>>(
    () => Object.fromEntries(ADMIN_AREAS.map((a) => [a.key, true])) as Record<AdminAreaKey, boolean>,
  );
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ email: string; inviteUrl: string; emailSent: boolean } | null>(null);
  const [inviteSearch, setInviteSearch] = useState('');
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);

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

  useEffect(() => { loadUsers(); loadInvitations(); }, []);

  const loadInvitations = async () => {
    setInvitationsError('');
    try {
      const res = await fetch('/api/admin/access/invitations');
      if (!res.ok) throw new Error('Could not load invitations');
      const data = await res.json();
      setInvitations(data.invitations ?? []);
    } catch {
      setInvitationsError('Could not load invitations. Please try again.');
    }
  };

  const filteredInvitations = useMemo(() => {
    const term = inviteSearch.trim().toLowerCase();
    if (!term) return invitations;
    return invitations.filter(
      (i) => `${i.firstName} ${i.lastName}`.toLowerCase().includes(term) || i.email.toLowerCase().includes(term),
    );
  }, [invitations, inviteSearch]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) => u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term));
  }, [users, search]);

  const selectUser = (user: AccessUser) => {
    setSelectedId(user.id);
    setEditName(user.name);
    setEditPhone(user.phone ?? '');
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
    if (!window.confirm(`Revoke admin access for ${selected.name}? They will return to their previous role — a teacher keeps teaching — and be signed out of the admin portal. Their account and data are NOT deleted.`)) return;
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

  const inviteCheckedCount = ADMIN_AREAS.filter((a) => inviteChecks[a.key]).length;

  /**
   * Module 18 "Grant Admin Access" submit.
   * Case A — an account with this email already exists: grant admin to
   * it directly (the flag-preserving PATCH — a teacher stays a teacher).
   * Case B — no account: create an invitation; the invitee sets their
   * own password from the link. When email is not configured the
   * invite link is shown here to copy by hand.
   */
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!inviteFirstName.trim() || !inviteLastName.trim() || !email.includes('@')) {
      toast.error('Enter a first name, last name and a valid email');
      return;
    }
    if (inviteCheckedCount === 0) {
      toast.error('Select at least one admin area to grant');
      return;
    }
    setInviting(true);
    setInviteResult(null);
    try {
      const existing = users.find((u) => u.email.toLowerCase() === email);
      if (existing) {
        const res = await fetch(`/api/admin/access/users/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissions: inviteChecks }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Could not grant admin access');
        toast.success(`${existing.name} already had an account — admin access granted directly`);
        await loadUsers();
        selectUser(data.user as AccessUser);
        return;
      }
      const res = await fetch('/api/admin/access/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: inviteFirstName.trim(),
          lastName: inviteLastName.trim(),
          email,
          contactNumber: inviteContact.trim() || undefined,
          isTeacher: inviteIsTeacher,
          permissions: inviteChecks,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not send the invitation');
      setInviteResult({ email: data.invitation.email, inviteUrl: data.inviteUrl, emailSent: data.emailSent });
      toast.success(data.emailSent ? `Invitation sent to ${email}` : 'Invitation created — email is not configured, copy the link below');
      setInviteFirstName('');
      setInviteLastName('');
      setInviteEmail('');
      setInviteContact('');
      setInviteIsTeacher(false);
      await loadInvitations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not grant admin access');
    } finally {
      setInviting(false);
    }
  };

  /** Resend mints a fresh invitation (new token + new 7-day window); the old link stops working. */
  const handleResendInvitation = async (inv: AdminInvitation) => {
    try {
      const res = await fetch(`/api/admin/access/invitations/${inv.id}/resend`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not resend the invitation');
      setInviteResult({ email: data.invitation.email, inviteUrl: data.inviteUrl, emailSent: data.emailSent });
      toast.success(data.emailSent ? `Invitation resent to ${inv.email}` : 'New invitation created — email is not configured, copy the link below');
      await loadInvitations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not resend the invitation');
    }
  };

  const handleRevokeInvitation = async (inv: AdminInvitation) => {
    if (!window.confirm(`Revoke the invitation for ${inv.firstName} ${inv.lastName} (${inv.email})? They will not be able to use the link.`)) return;
    try {
      const res = await fetch(`/api/admin/access/invitations/${inv.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not revoke the invitation');
      toast.success(`Invitation revoked for ${inv.email}`);
      await loadInvitations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not revoke the invitation');
    }
  };

  /** Edit the selected user's basic details (name/phone). Roles are never changed here. */
  const handleSaveDetails = async () => {
    if (!selected) return;
    if (!editName.trim()) { toast.error('Name is required'); return; }
    setSavingDetails(true);
    try {
      const res = await fetch(`/api/admin/users/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), phone: editPhone.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not save details');
      toast.success(`Details updated for ${selected.name}`);
      await loadUsers();
      selectUser(data.user as AccessUser);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save details');
    } finally {
      setSavingDetails(false);
    }
  };

  /** Suspend (deactivate) or reactivate the selected user. Suspending signs them out immediately. */
  const handleToggleStatus = async () => {
    if (!selected) return;
    const next = selected.status === 'suspended' ? 'active' : 'suspended';
    if (next === 'suspended' && !window.confirm(`Suspend ${selected.name}? They will be signed out immediately and cannot sign in until reactivated.`)) return;
    setTogglingStatus(true);
    try {
      const res = await fetch(`/api/admin/users/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not change status');
      toast.success(next === 'suspended' ? `${selected.name} suspended` : `${selected.name} reactivated`);
      await loadUsers();
      selectUser({ ...selected, status: next });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change status');
    } finally {
      setTogglingStatus(false);
    }
  };

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary-text" /> Admin Access
        </h1>
        <p className="text-muted text-sm mt-1">
          Give someone admin access and choose exactly which areas they can open.
          Only full admins can use this page. Changes apply on the user&apos;s next request.
          You cannot change your own access.
        </p>
      </FadeIn>

      {/* Module 18: Grant Admin Access — invite a new person, or grant to an existing account. */}
      <FadeIn delay={0.03}>
        <Card>
          <h2 className="text-foreground font-bold flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary-text" /> Grant Admin Access
          </h2>
          <p className="text-muted text-sm mt-1">
            Invite someone to join as an admin. If they already have an account, admin access is
            granted directly (a teacher stays a teacher). If not, they get an invitation link and
            set their own password — nobody here chooses a password for them. Invitations expire
            after 7 days and can only be used once.
          </p>
          <form onSubmit={handleInviteSubmit} className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="First Name" placeholder="e.g. Nadia" value={inviteFirstName} onChange={(e) => setInviteFirstName(e.target.value)} required />
              <Input label="Last Name" placeholder="e.g. Khan" value={inviteLastName} onChange={(e) => setInviteLastName(e.target.value)} required />
              <Input label="Email" type="email" placeholder="name@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
              <Input label="Contact Number (optional)" placeholder="+92 ..." value={inviteContact} onChange={(e) => setInviteContact(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={inviteIsTeacher}
                onChange={(e) => setInviteIsTeacher(e.target.checked)}
                className="accent-[#F5C518]"
              />
              <span className="text-sm text-foreground">Also a teacher (keeps the instructor portal alongside admin)</span>
            </label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => setInviteChecks(Object.fromEntries(ADMIN_AREAS.map((a) => [a.key, true])) as Record<AdminAreaKey, boolean>)}
              >
                Grant all areas (full admin)
              </Button>
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => setInviteChecks(Object.fromEntries(ADMIN_AREAS.map((a) => [a.key, false])) as Record<AdminAreaKey, boolean>)}
              >
                Clear all
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ADMIN_AREAS.map((area) => (
                <label
                  key={area.key}
                  className="flex items-start gap-2 rounded-lg border border-dark-border px-3 py-2 cursor-pointer hover:border-primary/30"
                >
                  <input
                    type="checkbox"
                    checked={inviteChecks[area.key]}
                    onChange={(e) => setInviteChecks((c) => ({ ...c, [area.key]: e.target.checked }))}
                    className="mt-1 accent-[#F5C518]"
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">{area.label}</span>
                    <span className="block text-xs text-muted">{area.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted">
              {inviteCheckedCount === ADMIN_AREAS.length
                ? 'All areas checked — saving grants full admin access.'
                : `${inviteCheckedCount} of ${ADMIN_AREAS.length} areas selected.`}
            </p>
            <Button type="submit" loading={inviting} disabled={inviting || inviteCheckedCount === 0}>
              <Mail className="w-4 h-4" /> Grant admin access / Send invitation
            </Button>
          </form>
          {inviteResult && (
            <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3">
              <p className="text-sm font-semibold text-foreground">
                {inviteResult.emailSent
                  ? `Invitation sent to ${inviteResult.email}`
                  : `Invitation created for ${inviteResult.email} — email is not configured`}
              </p>
              <p className="text-xs text-muted mt-1">
                {inviteResult.emailSent
                  ? 'The invitee sets their own password from the emailed link (expires in 7 days).'
                  : 'No activation email was sent because email delivery is not set up yet. Copy the link below and share it yourself — it is the only copy; the link cannot be recovered later.'}
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  readOnly
                  value={inviteResult.inviteUrl}
                  onClick={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-0 rounded-lg border border-dark-border bg-background px-3 py-2 text-xs text-foreground"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  type="button"
                  onClick={async () => { await navigator.clipboard.writeText(inviteResult.inviteUrl); toast.success('Invite link copied'); }}
                >
                  <Copy className="w-4 h-4" /> Copy link
                </Button>
              </div>
            </div>
          )}
        </Card>
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
                      <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
                      <Badge variant={user.role === 'admin' ? 'primary' : 'muted'}>{user.role}</Badge>
                    </div>
                    <p className="text-xs text-muted truncate">{user.email}</p>
                    <p className="text-xs text-muted mt-1 flex items-center gap-1">
                      {hasAdminCapability(user)
                        ? <ShieldCheck className="w-3 h-3 text-primary-text" />
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
                  <h2 className="text-foreground font-bold">{selected.name}</h2>
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
                        <span className="block text-sm font-medium text-foreground">{area.label}</span>
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

                {/* Module 18: edit basic details + activate/deactivate. Revoking admin
                    above never deletes the account; suspending here only blocks sign-in. */}
                <div className="border-t border-dark-border pt-4 space-y-3">
                  <h3 className="text-sm font-bold text-foreground">Basic details</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input label="Name" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <Input label="Phone" placeholder="+92 ..." value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={handleSaveDetails} loading={savingDetails} disabled={savingDetails}>
                      <Save className="w-4 h-4" /> Save details
                    </Button>
                    <Button size="sm" variant={selected.status === 'suspended' ? 'secondary' : 'danger'} onClick={handleToggleStatus} loading={togglingStatus} disabled={togglingStatus}>
                      {selected.status === 'suspended' ? 'Reactivate account' : 'Suspend account'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted">
                    {selected.status === 'suspended'
                      ? 'This account is suspended and cannot sign in.'
                      : 'Suspending signs the user out immediately; reactivating lets them sign in again.'}
                  </p>
                </div>
              </div>
            )}
          </Card>
        </FadeIn>
      </div>

      {/* Module 18: pending / used / expired invitations. */}
      <FadeIn delay={0.15}>
        <Card>
          <h2 className="text-foreground font-bold flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary-text" /> Invitations
          </h2>
          <p className="text-muted text-sm mt-1">
            People invited to join as admins who do not have an account yet. Resend mints a fresh
            link (new 7-day window) and the old link stops working. Revoking deletes the invitation;
            used invitations are kept as history.
          </p>
          <div className="mt-4">
            <Input
              label="Search invitations"
              placeholder="Search by name or email"
              value={inviteSearch}
              onChange={(e) => setInviteSearch(e.target.value)}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
          <div className="mt-4 space-y-2">
            {invitationsError && <p className="text-red-400 text-sm">{invitationsError}</p>}
            {!invitationsError && filteredInvitations.length === 0 && (
              <p className="text-muted text-sm">No invitations yet. Use the form above to invite someone.</p>
            )}
            {filteredInvitations.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dark-border px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{inv.firstName} {inv.lastName}</p>
                  <p className="text-xs text-muted">{inv.email}{inv.contactNumber ? ` · ${inv.contactNumber}` : ''}</p>
                  <p className="text-xs text-muted mt-1">
                    Expires {new Date(inv.expiresAt).toLocaleDateString()}
                    {inv.usedAt ? ` · used ${new Date(inv.usedAt).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={inv.status === 'pending' ? 'primary' : 'muted'}>{inv.status}</Badge>
                  {inv.status !== 'used' && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => handleResendInvitation(inv)}>
                        <RefreshCw className="w-4 h-4" /> Resend
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => handleRevokeInvitation(inv)}>
                        <Ban className="w-4 h-4" /> Revoke
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </FadeIn>
    </div>
  );
}
