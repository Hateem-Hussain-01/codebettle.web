import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertNotViewAs, requireAdminArea } from '@/lib/api-helpers';
import {
  getTeamCreditSettings,
  SettingsValidationError,
  updateSiteSettings,
} from '@/lib/services/settings-service';

const settingsSchema = z.object({
  creditsPerEnrollment: z.number().int().min(0),
  earnOn: z.enum(['enrollment', 'approved_payment']),
  goodyPrices: z.object({
    bottle: z.number().int().min(0),
    diary: z.number().int().min(0),
    pen: z.number().int().min(0),
    keychain: z.number().int().min(0),
  }),
});

/**
 * POST /api/admin/credits/settings — save the team credit settings
 * (admin `credits` area): credits per referred enrolled student,
 * when the credit is earned, and each goody's credit price. The team
 * portal reads these live — nothing there hard-codes a number.
 * View-as sessions are view-only (403).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('credits');
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Credits per enrollment, earn-on mode and all four goody prices are required (whole numbers, 0 or more)' }, { status: 400 });
  }
  const { creditsPerEnrollment, earnOn, goodyPrices } = parsed.data;
  try {
    await updateSiteSettings({
      teamCreditsPerEnrollment: creditsPerEnrollment,
      teamCreditsEarnOn: earnOn,
      teamCreditsGoodyPriceBottle: goodyPrices.bottle,
      teamCreditsGoodyPriceDiary: goodyPrices.diary,
      teamCreditsGoodyPricePen: goodyPrices.pen,
      teamCreditsGoodyPriceKeychain: goodyPrices.keychain,
    });
    return NextResponse.json({ settings: await getTeamCreditSettings() });
  } catch (e) {
    if (e instanceof SettingsValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Could not save credit settings' }, { status: 500 });
  }
}
