import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import {
  SettingsValidationError,
  getSiteSettings,
  updateSiteSettings,
} from '@/lib/services/settings-service';

/**
 * GET /api/admin/links-page/settings — the Links page contact details
 * (tagline, phone, email, location). PATCH — update any subset.
 * Guard: requireAdminArea('links-page') — the editor works with just
 * the links-page area, it does NOT need the 'settings' area. Business
 * logic lives in lib/services/settings-service.ts (updateSiteSettings
 * validates + persists; reads are fail-safe).
 */
const linksSettingsSchema = z
  .object({
    linksTagline: z.string().min(1).optional(),
    linksPhone: z.string().min(1).optional(),
    linksEmail: z.string().email().optional(),
    linksLocation: z.string().min(1).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No settings provided' });

export async function GET() {
  const auth = await requireAdminArea('links-page');
  if ('error' in auth) return auth.error;
  const settings = await getSiteSettings();
  return NextResponse.json({
    settings: {
      linksTagline: settings.linksTagline,
      linksPhone: settings.linksPhone,
      linksEmail: settings.linksEmail,
      linksLocation: settings.linksLocation,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminArea('links-page');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = linksSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid details: provide a tagline, phone, a valid email and a location' },
      { status: 400 },
    );
  }
  try {
    const settings = await updateSiteSettings(parsed.data);
    return NextResponse.json({
      settings: {
        linksTagline: settings.linksTagline,
        linksPhone: settings.linksPhone,
        linksEmail: settings.linksEmail,
        linksLocation: settings.linksLocation,
      },
    });
  } catch (e) {
    if (e instanceof SettingsValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Could not save details' }, { status: 500 });
  }
}
