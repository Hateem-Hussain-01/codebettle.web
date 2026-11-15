import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { getAmbassadorByUserId, getAmbassadorStats, listMessagesForAmbassador } from '@/lib/db/ambassadors';
import { getAmbassadorMeetingLink } from '@/lib/services/settings-service';
import { buildReferralLink } from '@/lib/referral';
import { getAppBaseUrl } from '@/lib/email/resend';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Users } from 'lucide-react';
import AmbassadorDashboardClient from './ambassador-dashboard-client';

/**
 * Ambassador Dashboard (Eman, 16 Nov 2026) — /student/ambassador.
 *
 * Visible ONLY to approved ambassadors (active Ambassador row linked
 * to the signed-in student). Anyone else gets a clear message + a
 * link to apply — never a 500, never another ambassador's data.
 *
 * Contents v1: own referral code + link (copy button), the 4 stage
 * numbers (clicks / signups / enrollments / payments), My Team
 * (level-1 direct referrals + level-2 referrals of referrals), the
 * ambassador meeting link set by the admin, the ambassador's own
 * campus-group link + daily member count (manual update), and a
 * message-to-admin form + own sent-message history. More sections
 * will slot in here later per Eman's direction.
 *
 * The meeting link and the stats are read fresh from the DB on every
 * load, so an admin change is visible immediately (no stale value).
 */
export default async function AmbassadorDashboardPage() {
  const session = await getSession();
  if (!session || session.role !== 'student') redirect('/auth/login');

  const ambassador = await getAmbassadorByUserId(session.id);
  if (!ambassador || ambassador.status !== 'active') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-foreground">Ambassador</h1>
          <p className="text-muted text-sm mt-1">Your referral link, your team, and your ambassador tools.</p>
        </div>
        <Card className="py-16 text-center">
          <Users className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-foreground font-medium">You are not an ambassador yet</p>
          <p className="text-muted text-sm mt-1">
            Ambassadors get their own referral link and a dashboard to track who joins through them.
          </p>
          <Link href="/become-ambassador" className="inline-block mt-4">
            <Button>Become our Ambassador</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const [{ stats, teamLevel1, teamLevel2 }, messages, meetingLink] = await Promise.all([
    getAmbassadorStats(ambassador.id),
    listMessagesForAmbassador(ambassador.id),
    getAmbassadorMeetingLink(),
  ]);

  return (
    <AmbassadorDashboardClient
      ambassador={ambassador}
      referralLink={buildReferralLink(ambassador.referralCode, getAppBaseUrl())}
      stats={stats}
      teamLevel1={teamLevel1}
      teamLevel2={teamLevel2}
      meetingLink={meetingLink}
      messages={messages}
    />
  );
}
