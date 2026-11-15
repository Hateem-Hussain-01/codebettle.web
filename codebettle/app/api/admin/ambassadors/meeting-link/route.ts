import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import { SettingsValidationError, getAmbassadorMeetingLink, updateSiteSettings } from '@/lib/services/settings-service';

/**
 * GET /api/admin/ambassadors/meeting-link — the current ambassador
 * meeting link (admin only).
 *
 * PATCH /api/admin/ambassadors/meeting-link — set/update the ONE
 * ambassador meeting link (admin only). Body: { meetingLink: string }
 * — an http(s) URL, or '' to clear it. Stored as the
 * `ambassador.meetingLink` site setting, so ambassadors see the new
 * value on their next dashboard load (no stale value). The dashboard
 * reads it fresh from the DB every time.
 */
const patchSchema = z.object({
  meetingLink: z.string().max(500),
});

export async function GET() {
  const auth = await requireAdminArea('ambassadors');
  if ('error' in auth) return auth.error;
  return NextResponse.json({ meetingLink: await getAmbassadorMeetingLink() });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminArea('ambassadors');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return invalidBody('meetingLink is required');
  const meetingLink = parsed.data.meetingLink.trim();
  if (meetingLink !== '' && !/^https?:\/\/\S+$/.test(meetingLink)) {
    return NextResponse.json({ error: 'Meeting link must be a valid http(s) URL' }, { status: 400 });
  }
  try {
    await updateSiteSettings({ ambassadorMeetingLink: meetingLink });
  } catch (e) {
    if (e instanceof SettingsValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
  return NextResponse.json({ meetingLink });
}
