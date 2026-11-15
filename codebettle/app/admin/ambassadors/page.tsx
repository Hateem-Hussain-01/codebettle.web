import { connection } from 'next/server';
import { getAmbassadorApplicationById, isAmbassadorApplicationTableReady, listAmbassadorApplications } from '@/lib/db/ambassador-applications';
import {
  backfillAmbassadorsForApprovedApplications,
  countUnreadAmbassadorMessages,
  isAmbassadorTableReady,
  listAmbassadorMessages,
  listAmbassadorsWithStats,
} from '@/lib/db/ambassadors';
import { getUsersByIds } from '@/lib/db/users';
import { getAmbassadorMeetingLink } from '@/lib/services/settings-service';
import AmbassadorsClient from './ambassadors-client';

/**
 * Admin Ambassadors — server wrapper (PR #33 + referral tracking).
 *
 * ONE page, no new sidebar tab (Eman, 16 Nov 2026): applications
 * (existing), ambassadors with referral codes + 4-stage numbers +
 * team tree + group link/member count, the ambassador meeting link,
 * and the ambassador messages — all sections of this page.
 *
 * Backfill: applications approved before referral tracking shipped
 * get their ambassador row + code here (best-effort, idempotent),
 * so the admin never has to run anything extra for them.
 */
export default async function AdminAmbassadorsPage() {
  await connection();
  const tableMissing = !(await isAmbassadorApplicationTableReady());
  const page = await listAmbassadorApplications({ limit: '25' });

  // Referral tables: backfill + load everything the page's sections
  // need. All of it is fail-safe (empty when the migration has not
  // run) — the page never 500s on a missing referral table.
  let referralReady = false;
  let ambassadors: Awaited<ReturnType<typeof listAmbassadorsWithStats>> = [];
  let messages: Awaited<ReturnType<typeof listAmbassadorMessages>> = [];
  let unreadMessages = 0;
  let meetingLink = '';
  let ambassadorNames: Record<string, string> = {};
  try {
    referralReady = await isAmbassadorTableReady();
    if (referralReady) {
      await backfillAmbassadorsForApprovedApplications();
      [ambassadors, messages, unreadMessages, meetingLink] = await Promise.all([
        listAmbassadorsWithStats(),
        listAmbassadorMessages(),
        countUnreadAmbassadorMessages(),
        getAmbassadorMeetingLink(),
      ]);
      // Display names: the linked user account's name first, else
      // the application fullName, else the email (direct grants
      // with no account and no application).
      const linkedUserIds = ambassadors.map((a) => a.userId).filter((id): id is string => Boolean(id));
      const usersById = await getUsersByIds(linkedUserIds);
      for (const ambassador of ambassadors) {
        const fromUser = ambassador.userId ? usersById.get(ambassador.userId)?.name : undefined;
        let fromApplication: string | undefined;
        if (!fromUser && ambassador.applicationId) {
          fromApplication = (await getAmbassadorApplicationById(ambassador.applicationId))?.fullName;
        }
        ambassadorNames[ambassador.id] = fromUser ?? fromApplication ?? ambassador.email;
      }
    }
  } catch (e) {
    console.error('Failed to load ambassador referral data', e);
  }

  return (
    <AmbassadorsClient
      initialApplications={page.items}
      total={page.total}
      tableMissing={tableMissing}
      referralReady={referralReady}
      initialAmbassadors={ambassadors}
      ambassadorNames={ambassadorNames}
      initialMessages={messages}
      unreadMessages={unreadMessages}
      initialMeetingLink={meetingLink}
    />
  );
}
