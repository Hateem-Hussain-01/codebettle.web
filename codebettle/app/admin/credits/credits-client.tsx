'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Coins, Gift, X } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import type {
  AmbassadorRedemption,
  TeamCreditLedgerEntry,
  TeamGoody,
  TeamRedemption,
} from '@/lib/db/types';
import { TEAM_GOODIES, TEAM_GOODY_LABELS } from '@/lib/db/types';
import type { TeamCreditEarnOn, TeamCreditSettings } from '@/lib/services/settings-service';

interface MemberRow {
  teamAccessId: string;
  email: string;
  name: string | null;
  status: string;
  code: string | null;
  balance: number;
  held: number;
  earned: number;
}

interface CreditsAdminClientProps {
  settings: TeamCreditSettings;
  members: MemberRow[];
  redemptions: Array<TeamRedemption & { memberEmail: string }>;
  ledger: Array<TeamCreditLedgerEntry & { memberEmail: string }>;
  /** Ambassador redemption requests (Eman, 21 Nov 2026) — same
   * goodies + prices as the team system, decided here too. */
  ambassadorRedemptions: Array<AmbassadorRedemption & { ambassadorEmail: string }>;
  /** False until Eman runs the redemption SQL — the ambassador
   * section then shows a "not set up yet" note. */
  ambassadorRedemptionReady: boolean;
}

const KIND_LABEL: Record<TeamCreditLedgerEntry['kind'], string> = {
  earn: 'Earned',
  hold: 'Held',
  release: 'Released',
};

const REDEMPTION_BADGE: Record<TeamRedemption['status'], 'info' | 'success' | 'muted'> = {
  pending: 'info',
  approved: 'success',
  rejected: 'muted',
};

/**
 * Credits Management client (PR B, Eman 16 Nov 2026): the settings
 * form (earn rate, when credits are earned, goody prices), member
 * balances, redemption approve/reject, and the ledger. The form
 * posts numbers as numbers — the settings service stores them as
 * decimal strings and validates them server-side.
 */
export default function CreditsAdminClient(props: CreditsAdminClientProps) {
  const router = useRouter();
  const [creditsPerEnrollment, setCreditsPerEnrollment] = useState(String(props.settings.creditsPerEnrollment));
  const [earnOn, setEarnOn] = useState<TeamCreditEarnOn>(props.settings.earnOn);
  const [prices, setPrices] = useState<Record<TeamGoody, string>>({
    bottle: String(props.settings.goodyPrices.bottle),
    diary: String(props.settings.goodyPrices.diary),
    pen: String(props.settings.goodyPrices.pen),
    keychain: String(props.settings.goodyPrices.keychain),
  });
  const [saving, setSaving] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);

  const saveSettings = async () => {
    const parsedRate = Number.parseInt(creditsPerEnrollment, 10);
    const parsedPrices = Object.fromEntries(
      TEAM_GOODIES.map((g) => [g, Number.parseInt(prices[g], 10)]),
    ) as Record<TeamGoody, number>;
    if (!Number.isInteger(parsedRate) || parsedRate < 0) {
      toast.error('Credits per enrollment must be a whole number, 0 or more');
      return;
    }
    for (const goody of TEAM_GOODIES) {
      if (!Number.isInteger(parsedPrices[goody]) || parsedPrices[goody] < 0) {
        toast.error(`${TEAM_GOODY_LABELS[goody]} price must be a whole number, 0 or more`);
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/credits/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditsPerEnrollment: parsedRate, earnOn, goodyPrices: parsedPrices }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error((data as { error?: string } | null)?.error ?? 'Could not save settings');
        return;
      }
      toast.success('Credit settings saved');
      router.refresh();
    } catch {
      toast.error('Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const decideRedemption = async (id: string, decision: 'approved' | 'rejected') => {
    setDeciding(id);
    try {
      const res = await fetch(`/api/admin/credits/redemptions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error((data as { error?: string } | null)?.error ?? 'Could not decide this request');
        return;
      }
      toast.success(decision === 'approved' ? 'Redemption approved — goody issued' : 'Redemption rejected — credits released');
      router.refresh();
    } catch {
      toast.error('Could not decide this request');
    } finally {
      setDeciding(null);
    }
  };

  const decideAmbassadorRedemption = async (id: string, decision: 'approved' | 'rejected') => {
    setDeciding(id);
    try {
      const res = await fetch(`/api/admin/ambassador-redemptions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error((data as { error?: string } | null)?.error ?? 'Could not decide this request');
        return;
      }
      toast.success(decision === 'approved' ? 'Redemption approved — goody issued' : 'Redemption rejected — credits released');
      router.refresh();
    } catch {
      toast.error('Could not decide this request');
    } finally {
      setDeciding(null);
    }
  };

  const pending = props.redemptions.filter((r) => r.status === 'pending');
  const decided = props.redemptions.filter((r) => r.status !== 'pending');
  const ambassadorPending = props.ambassadorRedemptions.filter((r) => r.status === 'pending');
  const ambassadorDecided = props.ambassadorRedemptions.filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-6">
      {/* Settings */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Coins className="w-5 h-5 text-primary-text" /> Earn rate &amp; goody prices
        </h2>
        <p className="text-sm text-muted mt-1">
          These are the live numbers — the team portal and the ambassador dashboard both show them, and new credits
          are earned at this rate. The goody prices are shared: one catalogue for team members and ambassadors.
          Set the real numbers here.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Input
            label="Credits per referred enrolled student"
            type="number"
            min={0}
            step={1}
            value={creditsPerEnrollment}
            onChange={(e) => setCreditsPerEnrollment(e.target.value)}
          />
          <Select
            label="When is the credit earned?"
            value={earnOn}
            onChange={(e) => setEarnOn(e.target.value as TeamCreditEarnOn)}
            options={[
              { value: 'enrollment', label: 'On enrollment (default)' },
              { value: 'approved_payment', label: 'On approved payment' },
            ]}
          />
          {TEAM_GOODIES.map((goody) => (
            <Input
              key={goody}
              label={`${TEAM_GOODY_LABELS[goody]} — credit price`}
              type="number"
              min={0}
              step={1}
              value={prices[goody]}
              onChange={(e) => setPrices((p) => ({ ...p, [goody]: e.target.value }))}
            />
          ))}
        </div>
        <div className="mt-4">
          <Button onClick={saveSettings} disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </Card>

      {/* Member balances */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-foreground">Member balances</h2>
        {props.members.length === 0 ? (
          <p className="text-sm text-muted mt-3">No team members yet — grant team access from the Team section first.</p>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-dark-border">
                  <th className="py-2 pr-3 font-medium">Member</th>
                  <th className="py-2 pr-3 font-medium">Referral code</th>
                  <th className="py-2 pr-3 font-medium text-right">Balance</th>
                  <th className="py-2 pr-3 font-medium text-right">Held</th>
                  <th className="py-2 font-medium text-right">Total earned</th>
                </tr>
              </thead>
              <tbody>
                {props.members.map((m) => (
                  <tr key={m.teamAccessId} className="border-b border-dark-border last:border-0">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-foreground">{m.name ?? m.email}</p>
                      <p className="text-xs text-muted">{m.email}{m.status !== 'active' ? ` · ${m.status}` : ''}</p>
                    </td>
                    <td className="py-2 pr-3 font-mono text-primary-text">{m.code ?? '—'}</td>
                    <td className="py-2 pr-3 text-right font-black text-foreground">{m.balance}</td>
                    <td className="py-2 pr-3 text-right text-muted">{m.held}</td>
                    <td className="py-2 text-right text-muted">{m.earned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Redemption requests */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Gift className="w-5 h-5 text-primary-text" /> Redemption requests
        </h2>
        {pending.length === 0 && decided.length === 0 ? (
          <p className="text-sm text-muted mt-3">No redemption requests yet.</p>
        ) : (
          <>
            {pending.length > 0 && (
              <ul className="space-y-3 mt-4">
                {pending.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border border-primary/30 rounded-xl p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{TEAM_GOODY_LABELS[r.goody]} — {r.memberEmail}</p>
                      <p className="text-xs text-muted">Requested {formatDateShort(r.requestedAt)} · {r.creditsSpent} credits held</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button onClick={() => decideRedemption(r.id, 'approved')} disabled={deciding !== null}>
                        <Check className="w-4 h-4" /> Approve
                      </Button>
                      <Button onClick={() => decideRedemption(r.id, 'rejected')} disabled={deciding !== null}>
                        <X className="w-4 h-4" /> Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {decided.length > 0 && (
              <ul className="space-y-3 mt-4">
                {decided.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 border-b border-dark-border pb-3 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{TEAM_GOODY_LABELS[r.goody]} — {r.memberEmail}</p>
                      <p className="text-xs text-muted">Requested {formatDateShort(r.requestedAt)}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-bold text-foreground">{r.creditsSpent} credits</span>
                      <Badge variant={REDEMPTION_BADGE[r.status]}>{r.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>

      {/* Ambassador redemption requests (Eman, 21 Nov 2026): same
          goodies + prices as above, decided the same way. */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Gift className="w-5 h-5 text-primary-text" /> Ambassador redemption requests
        </h2>
        {!props.ambassadorRedemptionReady ? (
          <p className="text-sm text-muted mt-3">
            Ambassador redemptions are not set up yet — run codebettle-ambassador-redemption-migration.sql in the
            Supabase SQL Editor first.
          </p>
        ) : ambassadorPending.length === 0 && ambassadorDecided.length === 0 ? (
          <p className="text-sm text-muted mt-3">No ambassador redemption requests yet.</p>
        ) : (
          <>
            {ambassadorPending.length > 0 && (
              <ul className="space-y-3 mt-4">
                {ambassadorPending.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border border-primary/30 rounded-xl p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{TEAM_GOODY_LABELS[r.goody]} — {r.ambassadorEmail}</p>
                      <p className="text-xs text-muted">Requested {formatDateShort(r.requestedAt)} · {r.creditsSpent} credits held</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button onClick={() => decideAmbassadorRedemption(r.id, 'approved')} disabled={deciding !== null}>
                        <Check className="w-4 h-4" /> Approve
                      </Button>
                      <Button onClick={() => decideAmbassadorRedemption(r.id, 'rejected')} disabled={deciding !== null}>
                        <X className="w-4 h-4" /> Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {ambassadorDecided.length > 0 && (
              <ul className="space-y-3 mt-4">
                {ambassadorDecided.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 border-b border-dark-border pb-3 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{TEAM_GOODY_LABELS[r.goody]} — {r.ambassadorEmail}</p>
                      <p className="text-xs text-muted">Requested {formatDateShort(r.requestedAt)}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-bold text-foreground">{r.creditsSpent} credits</span>
                      <Badge variant={REDEMPTION_BADGE[r.status]}>{r.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>

      {/* Ledger */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-foreground">Credit history</h2>
        {props.ledger.length === 0 ? (
          <p className="text-sm text-muted mt-3">No credit activity yet.</p>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-dark-border">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Member</th>
                  <th className="py-2 pr-3 font-medium">What happened</th>
                  <th className="py-2 font-medium text-right">Credits</th>
                </tr>
              </thead>
              <tbody>
                {props.ledger.map((e) => (
                  <tr key={e.id} className="border-b border-dark-border last:border-0">
                    <td className="py-2 pr-3 text-muted whitespace-nowrap">{formatDateShort(e.createdAt)}</td>
                    <td className="py-2 pr-3 text-foreground">{e.memberEmail}</td>
                    <td className="py-2 pr-3">
                      <p className="text-foreground">{e.note ?? KIND_LABEL[e.kind]}</p>
                      <p className="text-xs text-muted">{KIND_LABEL[e.kind]}</p>
                    </td>
                    <td className={`py-2 text-right font-black ${e.amount >= 0 ? 'text-primary-text' : 'text-foreground'}`}>
                      {e.amount >= 0 ? `+${e.amount}` : e.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
