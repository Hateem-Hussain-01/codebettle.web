'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Coins, Copy, Gift, Link2, Users } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import FadeIn from '@/components/ui/FadeIn';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { TeamCreditLedgerEntry, TeamGoody, TeamRedemption } from '@/lib/db/types';
import { TEAM_GOODIES, TEAM_GOODY_LABELS } from '@/lib/db/types';
import type { TeamCreditEarnOn } from '@/lib/services/settings-service';

interface TeamCreditsClientProps {
  referralCode: string | null;
  summary: { balance: number; held: number; earned: number };
  earnRate: number;
  earnOn: TeamCreditEarnOn;
  goodyPrices: Record<TeamGoody, number>;
  redemptions: TeamRedemption[];
  ledger: TeamCreditLedgerEntry[];
  referred: Array<{ id: string; name: string; email: string; joinedAt: string }>;
}

const KIND_LABEL: Record<TeamCreditLedgerEntry['kind'], string> = {
  earn: 'Earned',
  hold: 'Held — pending redemption',
  release: 'Released — redemption rejected',
};

const REDEMPTION_BADGE: Record<TeamRedemption['status'], 'info' | 'success' | 'muted'> = {
  pending: 'info',
  approved: 'success',
  rejected: 'muted',
};

/**
 * Team Credits client (PR B, Eman 16 Nov 2026; referral-code
 * redesign 20 Nov 2026): referral CODE copy, goody redemption
 * requests, and the credit history. Every price and the earn rate
 * come from props (live admin settings) — this file never hard-codes
 * a credit number. There is no referral link any more — students
 * join with the code typed into the register form.
 */
export default function TeamCreditsClient(props: TeamCreditsClientProps) {
  const { referralCode, summary, earnRate, earnOn, goodyPrices, redemptions, ledger, referred } = props;
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [requesting, setRequesting] = useState<TeamGoody | null>(null);

  const copyCode = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
    } catch {
      // Clipboard unavailable — the code is still visible to copy by hand.
    }
    setCopied(true);
    toast.success('Referral code copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const requestGoody = async (goody: TeamGoody) => {
    setRequesting(goody);
    try {
      const res = await fetch('/api/team/credits/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goody }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error((data as { error?: string } | null)?.error ?? 'Could not request this goody');
        return;
      }
      toast.success('Request sent — an admin will review it');
      router.refresh();
    } catch {
      toast.error('Could not request this goody');
    } finally {
      setRequesting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Balance */}
      <FadeIn className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-primary-text"><Coins className="w-5 h-5" /></span>
            <span className="text-3xl font-black text-foreground">{summary.balance}</span>
          </div>
          <p className="mt-3 text-sm font-medium text-muted">Available credits</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-primary-text"><Gift className="w-5 h-5" /></span>
            <span className="text-3xl font-black text-foreground">{summary.held}</span>
          </div>
          <p className="mt-3 text-sm font-medium text-muted">Held in pending requests</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-primary-text"><Users className="w-5 h-5" /></span>
            <span className="text-3xl font-black text-foreground">{summary.earned}</span>
          </div>
          <p className="mt-3 text-sm font-medium text-muted">Total earned</p>
        </Card>
      </FadeIn>

      {/* Referral code (Eman, 20 Nov 2026): no link any more — the
          student types this code into the register form. */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Link2 className="w-5 h-5 text-primary-text" /> Your referral code
        </h2>
        <p className="text-sm text-muted mt-1">
          Share this code — you earn <strong className="text-foreground">{earnRate} credits</strong> for every student
          who enrolls with it
          {earnOn === 'approved_payment'
            ? ' once their payment is approved'
            : ''}.
        </p>
        {referralCode ? (
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-muted">Code</span>
              <span className="font-mono text-lg font-black tracking-widest text-primary-text">{referralCode}</span>
            </div>
            <div className="flex gap-2 flex-1">
              <Button onClick={copyCode} className="flex-shrink-0">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy code'}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted mt-4">Your referral code is being set up — check back in a moment.</p>
        )}
      </Card>

      {/* Goodies */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Gift className="w-5 h-5 text-primary-text" /> Redeem for goodies
        </h2>
        <p className="text-sm text-muted mt-1">
          Request a goody and an admin approves it — the credits are held while your request is pending, so they
          cannot be spent twice.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          {TEAM_GOODIES.map((goody) => {
            const price = goodyPrices[goody];
            const affordable = summary.balance >= price;
            return (
              <div key={goody} className="border border-dark-border rounded-xl p-4 flex flex-col">
                <p className="font-bold text-foreground">{TEAM_GOODY_LABELS[goody]}</p>
                <p className="text-2xl font-black text-primary-text mt-2">{price} <span className="text-sm font-medium text-muted">credits</span></p>
                <Button
                  onClick={() => requestGoody(goody)}
                  disabled={!affordable || requesting !== null}
                  className="mt-4 w-full"
                >
                  {requesting === goody ? 'Requesting…' : affordable ? 'Request' : 'Not enough credits'}
                </Button>
              </div>
            );
          })}
        </div>
      </Card>

      {/* My redemptions */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-foreground">My redemptions</h2>
        {redemptions.length === 0 ? (
          <p className="text-sm text-muted mt-3">No redemption requests yet — pick a goody above to request one.</p>
        ) : (
          <ul className="space-y-3 mt-4">
            {redemptions.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 border-b border-dark-border pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{TEAM_GOODY_LABELS[r.goody]}</p>
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
      </Card>

      {/* Credit history */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-foreground">Credit history</h2>
        {ledger.length === 0 ? (
          <p className="text-sm text-muted mt-3">
            No credits yet — share your referral link and you will earn {earnRate} credits for every student who
            enrolls through it.
          </p>
        ) : (
          <ul className="space-y-3 mt-4">
            {ledger.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 border-b border-dark-border pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{e.note ?? KIND_LABEL[e.kind]}</p>
                  <p className="text-xs text-muted">{KIND_LABEL[e.kind]} · {formatDateShort(e.createdAt)}</p>
                </div>
                <span className={`text-sm font-black shrink-0 ${e.amount >= 0 ? 'text-primary-text' : 'text-foreground'}`}>
                  {e.amount >= 0 ? `+${e.amount}` : e.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Referred students */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-foreground">Students who joined through you</h2>
        {referred.length === 0 ? (
          <p className="text-sm text-muted mt-3">Nobody has signed up through your link yet.</p>
        ) : (
          <ul className="space-y-2 mt-4">
            {referred.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2 border-b border-dark-border last:border-0">
                <div className="w-9 h-9 rounded-lg bg-dark-border flex items-center justify-center flex-shrink-0">
                  <Users className="w-4 h-4 text-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-medium text-sm truncate">{m.name}</p>
                  <p className="text-muted text-xs truncate">{m.email} · Joined {formatDateShort(m.joinedAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
