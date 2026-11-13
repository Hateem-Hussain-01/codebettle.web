import { NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { getSiteSettings } from '@/lib/services/settings-service';
import { areSuccessStoryTablesReady } from '@/lib/db/success-stories';
import { areTeamMemberTablesReady } from '@/lib/db/team-members';

/**
 * GET /api/admin/success-stories-management/config — the page-level
 * config the management tab edits: video + vision layout and the four
 * stat cards (all SiteSetting keys). Guard:
 * requireAdminArea('success-stories-management'). Includes
 * `tablesReady` (team + story tables) so the UI can show a "run the
 * SQL" state when the migration has not run yet. getSiteSettings()
 * never throws, so this route always answers.
 */
export async function GET() {
  const auth = await requireAdminArea('success-stories-management');
  if ('error' in auth) return auth.error;
  const [settings, storiesReady, teamReady] = await Promise.all([
    getSiteSettings(),
    areSuccessStoryTablesReady(),
    areTeamMemberTablesReady(),
  ]);
  return NextResponse.json({
    video: {
      videoUrl: settings.videoUrl,
      videoLayout: settings.videoLayout,
      videoPosition: settings.videoPosition,
      videoOrientation: settings.videoOrientation,
    },
    stats: {
      happyStudents: settings.statsHappyStudents,
      averageRating: settings.statsAverageRating,
      recommendRate: settings.statsRecommendRate,
      hoursOfLearning: settings.statsHoursOfLearning,
    },
    tablesReady: storiesReady && teamReady,
    storiesTablesReady: storiesReady,
    teamTablesReady: teamReady,
  });
}
