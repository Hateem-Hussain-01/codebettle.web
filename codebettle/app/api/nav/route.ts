import { NextResponse } from 'next/server';
import { getPublicNavConfig } from '@/lib/nav-config';

/**
 * GET /api/nav — the public navbar config: enabled nav items in order
 * + the navbar logo URL + fromDefaults (true only when no config is
 * saved in the DB and the items are the hardcoded defaults). FAIL-SAFE:
 * getPublicNavConfig() never throws, so this route always answers.
 * No auth: the navbar renders on every public page.
 *
 * No-store: the Navbar revalidates against this route in the
 * background on every mount. A cached response could resurrect a
 * nav item the admin just deleted, so the answer must always be
 * fresh DB truth.
 */
export async function GET() {
  const config = await getPublicNavConfig();
  return NextResponse.json(config, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
