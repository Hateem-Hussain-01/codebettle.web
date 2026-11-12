import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import { settingsUpdateSchema } from '@/lib/api-schemas';
import {
  SettingsValidationError,
  getSiteSettings,
  updateSiteSettings,
} from '@/lib/services/settings-service';

/**
 * GET /api/admin/settings — current site settings (admin only,
 * `settings` area — same area as the payment accounts and social
 * links managed on the same settings page).
 * PATCH /api/admin/settings — update any subset of the six settings
 * (admin only). Business logic lives in
 * lib/services/settings-service.ts. Reads are fail-safe (defaults
 * when the table is missing); saves surface errors — a failed save
 * is never reported as a success.
 */
export async function GET() {
  const auth = await requireAdminArea('settings');
  if ('error' in auth) return auth.error;
  const settings = await getSiteSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminArea('settings');
  if ('error' in auth) return auth.error;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = settingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid settings: provide non-empty values and a valid contact email' },
      { status: 400 },
    );
  }
  try {
    const settings = await updateSiteSettings(parsed.data);
    return NextResponse.json({ settings });
  } catch (e) {
    if (e instanceof SettingsValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Could not save settings' }, { status: 500 });
  }
}
