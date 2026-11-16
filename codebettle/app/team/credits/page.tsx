import { connection } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTeamAccessByEmail, getTeamAccessByUserId } from '@/lib/db/team';
import {
  ensureTeamReferralCode,
  getTeamCreditSummary,
  isTeamCreditTableReady,
  listTeamCreditLedgerForMember,
  listTeamRedemptionsForMember,
  listTeamReferralAttributionsForMember,
  TEAM_CREDIT_TABLE_MISSING_MESSAGE,
} from '@/lib/db/team-credits';
import { getTeamCreditSettings } from '@/lib/services/settings-service';
import { getUsersByIds } from '@/lib/db/users';
import { buildReferralLink } from '@/lib/referral';
import { getAppBaseUrl } from '@/lib/email/resend';
import Card from '@/components/ui/Card';
import { Coins } from 'lucide-react';
import TeamCreditsClient from './credits-client';

/**
 * Team Credits (PR B, Eman 16 Nov 2026) — /team/credits.
 *
 * The member's referral link/code (copy button), total credits,
 * credit history (which student's enrollment earned what), goodies
 * with their credit prices + redemption requests, and their own
 * redemption history. Every number on this page reads the live admin
 * setting — nothing is hard-coded.
 *
 * Fail-safe: until Eman runs codebettle-team-credits-migration.sql
 * the page shows a "not set up yet" notice instead of a 500. The
 * member's referral code is minted on first visit here (and by the
 * admin backfill on the Credits Management page).
 */
export default async function TeamCreditsPage() {
  await connection();
  const session = await getSession();
  const access =
    (await getTeamAccessByUserId(session!.id)) ?? (await getTeamAccessByEmail(session!.email));
  if (!access) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-black text-foreground">Credits</h1>
        <Card className="p-6">
          <p className="text-sm text-muted">No team access is linked to this account yet — an admin grants it by email.</p>
        </Card>
      </div>
    );
  }

  const ready = await isTeamCreditTableReady();
  if (!ready) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-black text-foreground">Credits</h1>
        <Card className="p-6">
          <h2 className="text-lg font-bold text-foreground">Credits are not set up yet</h2>
          <p className="text-sm text-muted mt-2 leading-relaxed">{TEAM_CREDIT_TABLE_MISSING_MESSAGE}</p>
        </Card>
      </div>
    );
  }

  // Mint the member's referral code on first visit (idempotent — an
  // existing code is returned, never a second one). A mint failure
  // shows the page without a code, never a 500.
  let referralCode: string | null = null;
  try {
    referralCode = (await ensureTeamReferralCode(access.id)).code;
  } catch (error) {
    console.error('[team-credits] Failed to mint referral code for team member', access.id, error);
  }

  const [summary, ledger, redemptions, attributions, settings] = await Promise.all([
    getTeamCreditSummary(access.id),
    listTeamCreditLedgerForMember(access.id),
    listTeamRedemptionsForMember(access.id),
    listTeamReferralAttributionsForMember(access.id),
    getTeamCreditSettings(),
  ]);
  const referredUserIds = attributions.map((a) => a.userId);
  const usersById = await getUsersByIds(referredUserIds);
  const referred = attributions
    .map((a) => {
      const user = usersById.get(a.userId);
      if (!user) return null;
      return {
        id: a.userId,
        name: user.name,
        email: user.email,
        // The attribution was created at registration — the date this
        // student signed up through the member's link.
        joinedAt: a.createdAt.slice(0, 10),
      };
    })
    .filter((m): m is { id: string; name: string; email: string; joinedAt: string } => m !== null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Coins className="w-6 h-6 text-primary-text" /> Credits
        </h1>
        <p className="text-muted mt-1">
          Earn credits when students enroll through your referral link, then redeem them for CodeBettle goodies.
        </p>
      </div>
      <TeamCreditsClient
        referralCode={referralCode}
        referralLink={referralCode ? buildReferralLink(referralCode, getAppBaseUrl()) : null}
        summary={summary}
        earnRate={settings.creditsPerEnrollment}
        earnOn={settings.earnOn}
        goodyPrices={settings.goodyPrices}
        redemptions={redemptions}
        ledger={ledger}
        referred={referred}
      />
    </div>
  );
}
