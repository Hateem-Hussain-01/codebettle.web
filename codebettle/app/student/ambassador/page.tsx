import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { hasTeacherCapability } from '@/lib/rbac';
import { getAmbassadorByUserId, getAmbassadorStats, listMessagesForAmbassador } from '@/lib/db/ambassadors';
import {
  getAmbassadorCreditSummary,
  isAmbassadorRedemptionTableReady,
  listAmbassadorRedemptionsForAmbassador,
} from '@/lib/db/ambassador-credits';
import { getAmbassadorMeetingLink, getTeamCreditSettings } from '@/lib/services/settings-service';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Users } from 'lucide-react';
import AmbassadorDashboardClient from './ambassador-dashboard-client';

/**
 * Ambassador Dashboard (Eman, 16 Nov 2026; redesigned 20 Nov 2026) — /student/ambassador.
 *
 * Visible ONLY to approved ambassadors (active Ambassador row linked
 * to the signed-in student). Anyone else gets a clear message + a
 * link to apply — never a 500, never another ambassador's data.
 *
 * Contents v1: own referral code (students type it on the register
 * form — there is no link tracking any more), the 3 stage numbers
 * (signups / enrollments / payments), credits earned (100 per
 * referred student on their first enrollment), My Team (level-1
 * direct referrals + level-2 referrals of referrals), the ambassador
 * meeting link set by the admin, the ambassador's own campus-group
 * link + daily member count (manual update), and a message-to-admin
 * form + own sent-message history. More sections will slot in here
 * later per Eman's direction.
 *
 * The meeting link, the stats and the credits are read fresh from
 * the DB on every load, so an admin change is visible immediately
 * (no stale value).
 */
export default async function AmbassadorDashboardPage() {
  const session = await getSession();
  // Dashboard switcher (Eman, 16 Nov 2026): the ambassador page
  // lives in the student portal, but a teacher+ambassador opens it
  // from the instructor portal too — so teacher-capable sessions pass
  // this guard as well (the student layout exempts this one path the
  // same way). Anyone who is not an ambassador still gets the
  // friendly message below, never a 500.
  if (!session || (session.role !== 'student' && !hasTeacherCapability(session))) redirect('/auth/login');

  const ambassador = await getAmbassadorByUserId(session.id);
  if (!ambassador || ambassador.status !== 'active') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-foreground">Ambassador</h1>
          <p className="text-muted text-sm mt-1">Your referral code, your team, and your ambassador tools.</p>
        </div>
        <Card className="py-16 text-center">
          <Users className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-foreground font-medium">You are not an ambassador yet</p>
          <p className="text-muted text-sm mt-1">
            Ambassadors get their own referral code and a dashboard to track who joins with it.
          </p>
          <Link href="/become-ambassador" className="inline-block mt-4">
            <Button>Become our Ambassador</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const [{ stats, teamLevel1, teamLevel2 }, messages, meetingLink, creditSummary, settings, redemptions, redemptionReady] =
    await Promise.all([
      getAmbassadorStats(ambassador.id),
      listMessagesForAmbassador(ambassador.id),
      getAmbassadorMeetingLink(),
      getAmbassadorCreditSummary(ambassador.id),
      getTeamCreditSettings(),
      listAmbassadorRedemptionsForAmbassador(ambassador.id),
      isAmbassadorRedemptionTableReady(),
    ]);

  return (
    <AmbassadorDashboardClient
      ambassador={ambassador}
      stats={stats}
      creditBalance={creditSummary.balance}
      goodyPrices={settings.goodyPrices}
      redemptions={redemptions}
      redemptionReady={redemptionReady}
      teamLevel1={teamLevel1}
      teamLevel2={teamLevel2}
      meetingLink={meetingLink}
      messages={messages}
      // Dashboard switcher (Eman, 16 Nov 2026): the Student Portal
      // link is always shown; the Instructor Portal link only when
      // the session holds teacher capability.
      showInstructorPortal={hasTeacherCapability(session)}
    />
  );
}
