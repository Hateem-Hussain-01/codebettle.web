import { connection } from 'next/server';
import { getTeamCreditSettings } from '@/lib/services/settings-service';
import {
  backfillTeamReferralCodes,
  getTeamCreditBalances,
  isTeamCreditTableReady,
  listTeamCreditLedger,
  listTeamRedemptions,
  listTeamReferralCodes,
  TEAM_CREDIT_TABLE_MISSING_MESSAGE,
} from '@/lib/db/team-credits';
import { listTeamAccess } from '@/lib/db/team';
import { getUsersByIds } from '@/lib/db/users';
import Card from '@/components/ui/Card';
import CreditsAdminClient from './credits-client';

/**
 * Admin Credits Management (PR B, Eman 16 Nov 2026) — the DEDICATED
 * credits section (NOT inside the Team section): (1) credits per
 * referred enrolled student, (2) each goody's credit price, (3) all
 * team members' credit balances, (4) redemption requests
 * (approve/reject), (5) credit history/ledger.
 *
 * The numbers here are the LIVE settings — the team portal reads
 * them directly. The seeded values are PLACEHOLDERS (Eman sets the
 * real numbers himself).
 *
 * Fail-safe: until Eman runs codebettle-team-credits-migration.sql
 * the page shows a "run the SQL" card instead of a 500.
 */
export default async function AdminCreditsPage() {
  await connection();
  const ready = await isTeamCreditTableReady();
  if (!ready) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-black text-foreground">Credits Management</h1>
        <Card className="p-6">
          <h2 className="text-lg font-bold text-foreground">Credits are not set up yet</h2>
          <p className="text-sm text-muted mt-2 leading-relaxed">{TEAM_CREDIT_TABLE_MISSING_MESSAGE}</p>
          <p className="text-sm text-muted mt-2 leading-relaxed">
            Run <code className="text-primary-text">codebettle-team-credits-migration.sql</code> in the Supabase
            SQL Editor, then this page will load.
          </p>
        </Card>
      </div>
    );
  }

  // Backfill referral codes for members granted before this feature
  // shipped (best-effort — a failure never blocks the page).
  try {
    await backfillTeamReferralCodes();
  } catch (error) {
    console.error('[team-credits] Backfill of team referral codes failed', error);
  }

  const [settings, grants, redemptions, ledger, codes] = await Promise.all([
    getTeamCreditSettings(),
    listTeamAccess(),
    listTeamRedemptions(),
    listTeamCreditLedger(),
    listTeamReferralCodes(),
  ]);
  const balances = await getTeamCreditBalances(grants.map((g) => g.id));
  const linkedUserIds = grants.map((g) => g.userId).filter((id): id is string => Boolean(id));
  const usersById = await getUsersByIds(linkedUserIds);
  const codeByAccessId = new Map(codes.map((c) => [c.teamAccessId, c.code]));
  const emailByAccessId = new Map(grants.map((g) => [g.id, g.email]));

  const earnedByAccessId = new Map<string, number>();
  for (const entry of ledger) {
    if (entry.kind !== 'earn') continue;
    earnedByAccessId.set(entry.teamAccessId, (earnedByAccessId.get(entry.teamAccessId) ?? 0) + entry.amount);
  }
  const heldByAccessId = new Map<string, number>();
  for (const r of redemptions) {
    if (r.status !== 'pending') continue;
    heldByAccessId.set(r.teamAccessId, (heldByAccessId.get(r.teamAccessId) ?? 0) + r.creditsSpent);
  }

  const members = grants.map((g) => ({
    teamAccessId: g.id,
    email: g.email,
    name: g.userId ? (usersById.get(g.userId)?.name ?? null) : null,
    status: g.status,
    code: codeByAccessId.get(g.id) ?? null,
    balance: balances.get(g.id) ?? 0,
    held: heldByAccessId.get(g.id) ?? 0,
    earned: earnedByAccessId.get(g.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground">Credits Management</h1>
        <p className="text-muted mt-1">
          Team credits: earn rate, goody prices, member balances, redemption requests and the ledger. The numbers
          below are live — the team portal shows them everywhere.
        </p>
      </div>
      <CreditsAdminClient
        settings={settings}
        members={members}
        redemptions={redemptions.map((r) => ({
          ...r,
          memberEmail: emailByAccessId.get(r.teamAccessId) ?? 'Unknown member',
        }))}
        ledger={ledger.map((e) => ({
          ...e,
          memberEmail: emailByAccessId.get(e.teamAccessId) ?? 'Unknown member',
        }))}
      />
    </div>
  );
}
