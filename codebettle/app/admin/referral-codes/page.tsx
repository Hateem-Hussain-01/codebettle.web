import { connection } from 'next/server';
import { getAmbassadorApplicationById } from '@/lib/db/ambassador-applications';
import {
  backfillAmbassadorsForApprovedApplications,
  isAmbassadorTableReady,
  listAmbassadorsWithStats,
} from '@/lib/db/ambassadors';
import {
  countAmbassadorDiscounts,
  ensureAmbassadorCouponsForAll,
  getAmbassadorCreditBalances,
  isAmbassadorCreditTableReady,
} from '@/lib/db/ambassador-credits';
import { getUsersByIds } from '@/lib/db/users';
import ReferralCodesClient, { type ReferralCodeRow } from './referral-codes-client';

/**
 * Admin Referral Codes — the 33rd admin area (Eman, 20 Nov 2026).
 *
 * ONE table: every ambassador's code, owner, status, uses (signups),
 * credits awarded (100 per referred student on first enrollment) and
 * discounts given (enrollments that used the code's Rs 200 coupon),
 * plus create/assign/deactivate. Codes are ADMIN-ASSIGNED — there is
 * no auto-random code any more.
 *
 * Backfill: applications approved before this redesign shipped get
 * their ambassador row + code here (best-effort, idempotent), and
 * every code gets its canonical Rs 200 coupon row — so Eman's FG2SZU
 * and Areeba's U5W5GK keep working as coupons without anyone running
 * anything extra. All of it is fail-safe (empty when the migration
 * has not run) — the page never 500s on a missing table.
 */
export default async function AdminReferralCodesPage() {
  await connection();
  let rows: ReferralCodeRow[] = [];
  let referralReady = false;
  let creditTableReady = false;
  try {
    referralReady = await isAmbassadorTableReady();
    if (referralReady) {
      await backfillAmbassadorsForApprovedApplications();
      const ambassadors = await listAmbassadorsWithStats();
      const codes = ambassadors.map((a) => a.referralCode);
      // Best-effort: every code gets its canonical Rs 200 coupon.
      await ensureAmbassadorCouponsForAll(codes);
      const [balances, discounts] = await Promise.all([
        getAmbassadorCreditBalances(ambassadors.map((a) => a.id)),
        countAmbassadorDiscounts(codes),
      ]);
      creditTableReady = await isAmbassadorCreditTableReady();
      // Display names: the linked user account's name first, else
      // the application fullName, else the email (direct grants with
      // no account and no application).
      const linkedUserIds = ambassadors.map((a) => a.userId).filter((id): id is string => Boolean(id));
      const usersById = await getUsersByIds(linkedUserIds);
      const names: Record<string, string> = {};
      for (const ambassador of ambassadors) {
        const fromUser = ambassador.userId ? usersById.get(ambassador.userId)?.name : undefined;
        let fromApplication: string | undefined;
        if (!fromUser && ambassador.applicationId) {
          fromApplication = (await getAmbassadorApplicationById(ambassador.applicationId))?.fullName;
        }
        names[ambassador.id] = fromUser ?? fromApplication ?? ambassador.email;
      }
      rows = ambassadors.map((a) => ({
        id: a.id,
        code: a.referralCode,
        email: a.email,
        name: names[a.id] ?? a.email,
        status: a.status,
        signups: a.stats.signups,
        enrollments: a.stats.enrollments,
        payments: a.stats.payments,
        credits: balances.get(a.id) ?? 0,
        discounts: discounts.get(a.referralCode) ?? 0,
      }));
    }
  } catch (e) {
    console.error('Failed to load referral codes', e);
  }

  return (
    <ReferralCodesClient
      initialRows={rows}
      referralReady={referralReady}
      creditTableReady={creditTableReady}
    />
  );
}
