import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import {
  SettingsValidationError,
  updateSiteSettings,
} from '@/lib/services/settings-service';

/**
 * PATCH /api/admin/success-stories-management/stats — save the four
 * small stat cards shown on /success-stories after the Team section
 * (admin only, `success-stories-management` area). Body: any subset of
 * { happyStudents, averageRating, recommendRate, hoursOfLearning }
 * (non-empty strings, e.g. '1500+'). Saved as SiteSetting keys, so the
 * public page shows them with no deploy.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAdminArea('success-stories-management');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const v = body as Record<string, unknown>;
  const patch: Record<string, string> = {};
  for (const [key, field] of [
    ['happyStudents', 'statsHappyStudents'],
    ['averageRating', 'statsAverageRating'],
    ['recommendRate', 'statsRecommendRate'],
    ['hoursOfLearning', 'statsHoursOfLearning'],
  ] as const) {
    if (v[key] !== undefined) {
      if (typeof v[key] !== 'string' || v[key].trim() === '') {
        return NextResponse.json({ error: `${key} must be a non-empty value` }, { status: 400 });
      }
      if (v[key].length > 20) {
        return NextResponse.json({ error: `${key} must be 20 characters or fewer` }, { status: 400 });
      }
      patch[field] = v[key].trim();
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No stat values provided' }, { status: 400 });
  }
  try {
    const settings = await updateSiteSettings(patch);
    return NextResponse.json({
      stats: {
        happyStudents: settings.statsHappyStudents,
        averageRating: settings.statsAverageRating,
        recommendRate: settings.statsRecommendRate,
        hoursOfLearning: settings.statsHoursOfLearning,
      },
    });
  } catch (e) {
    if (e instanceof SettingsValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Could not save the stats' }, { status: 500 });
  }
}
