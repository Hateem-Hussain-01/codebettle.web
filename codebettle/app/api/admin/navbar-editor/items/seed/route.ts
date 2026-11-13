import { NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { listNavItems, seedDefaultNavItems } from '@/lib/db/nav-items';

/**
 * POST /api/admin/navbar-editor/items/seed — persist the default nav
 * config (the current hardcoded items, with 'Spotlight' for
 * /success-stories) into the NavItem table, the first time an admin
 * edits the navbar while the table is empty. Idempotent: a second
 * call returns the existing items instead of duplicating them.
 * Guard: requireAdminArea('navbar-editor').
 */
export async function POST() {
  const auth = await requireAdminArea('navbar-editor');
  if ('error' in auth) return auth.error;
  try {
    const items = await seedDefaultNavItems();
    return NextResponse.json({ items });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not seed the nav items';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not seed the nav items' }, { status: 500 });
  }
}

export async function GET() {
  const auth = await requireAdminArea('navbar-editor');
  if ('error' in auth) return auth.error;
  const items = await listNavItems();
  return NextResponse.json({ items });
}
