import { NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { seedDefaultLinks } from '@/lib/db/links';

/**
 * POST /api/admin/links-page/links/seed — persist the 6 default links
 * (lib/links.ts) into the Link table, the first time an admin opens
 * the Links Page editor while the table is empty. Idempotent: a
 * second call returns the existing links instead of duplicating them.
 * Guard: requireAdminArea('links-page').
 */
export async function POST() {
  const auth = await requireAdminArea('links-page');
  if ('error' in auth) return auth.error;
  try {
    const links = await seedDefaultLinks();
    return NextResponse.json({ links });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not seed the links';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not seed the links' }, { status: 500 });
  }
}
