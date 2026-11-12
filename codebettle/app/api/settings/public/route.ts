import { NextResponse } from 'next/server';
import { isMaintenanceMode } from '@/lib/services/settings-service';

/**
 * GET /api/settings/public — whether maintenance mode is on.
 * NO auth: the proxy needs it to decide whether to show the
 * maintenance page to visitors. Fail-open: on ANY error returns
 * { maintenanceMode: false }, so a broken settings read never takes
 * the whole site down. Nothing else is returned — no other setting
 * leaks publicly.
 */
export async function GET() {
  try {
    return NextResponse.json({ maintenanceMode: await isMaintenanceMode() });
  } catch {
    return NextResponse.json({ maintenanceMode: false });
  }
}
