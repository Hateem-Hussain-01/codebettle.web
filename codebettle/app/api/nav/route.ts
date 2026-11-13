import { NextResponse } from 'next/server';
import { getSiteSettings } from '@/lib/services/settings-service';
import { listNavItems } from '@/lib/db/nav-items';
import { resolveNavItems } from '@/lib/management';

/**
 * GET /api/nav — the public navbar config: enabled nav items in order
 * + the navbar logo URL. FAIL-SAFE: getSiteSettings() never throws and
 * listNavItems() returns [] when the table is missing, so this route
 * always answers — the navbar falls back to its hardcoded items
 * (with 'Spotlight' for /success-stories) when no config is stored.
 * No auth: the navbar renders on every public page.
 */
export async function GET() {
  const [settings, dbItems] = await Promise.all([getSiteSettings(), listNavItems()]);
  return NextResponse.json({
    items: resolveNavItems(dbItems),
    logoUrl: settings.navbarLogoUrl,
  });
}
