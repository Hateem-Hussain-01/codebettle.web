'use client';

import { useState } from 'react';
import { Check, Copy, Pencil, Plus, RefreshCw } from 'lucide-react';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import toast from 'react-hot-toast';
import type { AmbassadorStatus } from '@/lib/db/types';

/**
 * Admin Referral Codes — the 33rd admin area (Eman, 20 Nov 2026).
 *
 * Codes are ADMIN-ASSIGNED: the admin types the code when granting
 * or approving (6 chars, A–Z/2–9, no 0/O/1/I) — there is no
 * auto-random code any more. Every code IS a Rs 200 coupon (created
 * server-side when the code is assigned) and earns its ambassador
 * 100 credits per referred student on their first enrollment.
 *
 * This page shows every code with its owner, uses, credits awarded
 * and discounts given — and lets the admin assign a code to a new
 * ambassador by email, change a code, or deactivate/reactivate one.
 * Deactivating stops the code attributing NEW signups; the
 * ambassador's existing team, stats and credits are untouched.
 */
export interface ReferralCodeRow {
  id: string;
  code: string;
  email: string;
  name: string;
  status: AmbassadorStatus;
  signups: number;
  enrollments: number;
  payments: number;
  credits: number;
  discounts: number;
}

interface ReferralCodesClientProps {
  initialRows: ReferralCodeRow[];
  referralReady: boolean;
  creditTableReady: boolean;
}

export default function ReferralCodesClient({ initialRows, referralReady, creditTableReady }: ReferralCodesClientProps) {
  const [rows, setRows] = useState(initialRows);
  const [newEmail, setNewEmail] = useState('');
  const [newCode, setNewCode] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Clipboard unavailable — the code is still visible to copy by hand.
    }
    setCopiedCode(code);
    setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 2000);
    toast.success('Referral code copied');
  };

  const assignCode = async () => {
    const email = newEmail.trim();
    const code = newCode.trim().toUpperCase();
    if (!email.includes('@')) {
      toast.error('Enter a valid email address');
      return;
    }
    if (!code) {
      toast.error('Enter the referral code to assign');
      return;
    }
    setAssigning(true);
    try {
      const res = await fetch('/api/admin/referral-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, referralCode: code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? 'Could not assign the code');
        return;
      }
      const row = data.row as ReferralCodeRow | undefined;
      if (row) {
        setRows((r) => (r.some((x) => x.id === row.id) ? r.map((x) => (x.id === row.id ? row : x)) : [row, ...r]));
      }
      setNewEmail('');
      setNewCode('');
      toast.success(`Code ${code} assigned to ${email}`);
    } catch {
      toast.error('Could not assign the code');
    } finally {
      setAssigning(false);
    }
  };

  const patchRow = async (id: string, body: Record<string, unknown>, successMessage: string) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/referral-codes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? 'Could not update the code');
        return;
      }
      const row = data.row as ReferralCodeRow | undefined;
      if (row) setRows((r) => r.map((x) => (x.id === row.id ? row : x)));
      toast.success(successMessage);
    } catch {
      toast.error('Could not update the code');
    } finally {
      setSavingId(null);
    }
  };

  const saveNewCode = async (row: ReferralCodeRow) => {
    const code = editCode.trim().toUpperCase();
    if (!code) {
      toast.error('Enter the new referral code');
      return;
    }
    await patchRow(row.id, { action: 'change-code', referralCode: code }, `Code changed to ${code}`);
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-foreground">Referral Codes</h1>
        <p className="text-muted text-sm mt-1">
          Every ambassador&apos;s code, owner, uses, credits awarded and discounts given. Codes are assigned by the
          admin — each code is also a Rs 200 coupon and earns its ambassador 100 credits per referred student.
        </p>
      </FadeIn>

      {!referralReady ? (
        <Card className="border-primary/40">
          <p className="text-foreground font-medium">Referral codes are not set up yet</p>
          <p className="text-muted text-sm mt-1">
            Run <code className="text-primary-text">codebettle-ambassador-referral-migration.sql</code> in the Supabase SQL
            Editor first — until then no referral codes can be shown.
          </p>
        </Card>
      ) : (
        <>
          {!creditTableReady ? (
            <Card className="border-primary/40">
              <p className="text-foreground font-medium">Credits are not set up yet</p>
              <p className="text-muted text-sm mt-1">
                Run <code className="text-primary-text">codebettle-ambassador-credits-migration.sql</code> in the Supabase SQL
                Editor first — until then every ambassador shows 0 credits (uses and discounts still work).
              </p>
            </Card>
          ) : null}

          {/* Assign a code — give ambassador status + a code to one of
              your own people by email, no application needed. */}
          <Card>
            <h2 className="text-foreground font-semibold mb-1">Assign a code</h2>
            <p className="text-muted text-sm mb-3">
              Give ambassador status and a referral code to one of your own people by email. They get their dashboard
              as soon as they sign in with that email.
            </p>
            <div className="flex gap-2 flex-wrap">
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="name@example.com"
                aria-label="Email to assign a code to"
                className="flex-1 min-w-52"
              />
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="Code, e.g. FG2SZU"
                aria-label="Referral code to assign"
                className="w-44"
                maxLength={6}
              />
              <Button onClick={assignCode} loading={assigning}>
                <Plus className="w-4 h-4" /> Assign code
              </Button>
            </div>
          </Card>

          {rows.length === 0 ? (
            <Card className="py-12 text-center">
              <p className="text-foreground font-medium">No referral codes yet</p>
              <p className="text-muted text-sm mt-1">Approve an application, or assign a code above.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {rows.map((row, i) => {
                const editing = editingId === row.id;
                return (
                  <FadeIn key={row.id} delay={Math.min(i, 4) * 0.05}>
                    <Card>
                      <div className="flex items-start gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-foreground font-medium text-sm">{row.name}</p>
                            <Badge variant={row.status === 'active' ? 'success' : 'muted'}>
                              {row.status === 'active' ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                          <p className="text-muted text-xs mt-0.5">{row.email}</p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="text-muted text-xs">Code</span>
                            <code className="text-primary-text font-mono font-bold text-sm">{row.code}</code>
                            <button
                              type="button"
                              onClick={() => copyCode(row.code)}
                              className="text-muted hover:text-primary-text"
                              aria-label={`Copy referral code ${row.code}`}
                            >
                              {copiedCode === row.code ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                          <div className="flex gap-4 mt-2 flex-wrap text-sm">
                            <span className="text-muted"><span className="text-foreground font-bold">{row.signups}</span> signups</span>
                            <span className="text-muted"><span className="text-foreground font-bold">{row.enrollments}</span> enrollments</span>
                            <span className="text-muted"><span className="text-foreground font-bold">{row.payments}</span> payments</span>
                            <span className="text-muted"><span className="text-foreground font-bold">{row.credits}</span> credits</span>
                            <span className="text-muted"><span className="text-foreground font-bold">{row.discounts}</span> discounts</span>
                          </div>
                          {editing ? (
                            <div className="flex gap-2 mt-3 flex-wrap">
                              <Input
                                value={editCode}
                                onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                                placeholder="New code, e.g. K7M2PQ"
                                aria-label="New referral code"
                                className="w-44"
                                maxLength={6}
                              />
                              <Button size="sm" onClick={() => saveNewCode(row)} loading={savingId === row.id}>Save code</Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                            </div>
                          ) : null}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditCode(row.code);
                              setEditingId(row.id);
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5" /> Change code
                          </Button>
                          {row.status === 'active' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => patchRow(row.id, { action: 'deactivate' }, `Code ${row.code} deactivated`)}
                              loading={savingId === row.id}
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => patchRow(row.id, { action: 'reactivate' }, `Code ${row.code} reactivated`)}
                              loading={savingId === row.id}
                            >
                              <RefreshCw className="w-3.5 h-3.5" /> Reactivate
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  </FadeIn>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
