import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import {
  areNavItemTablesReady,
  createNavItem,
  listNavItems,
} from '@/lib/db/nav-items';
import { validateNavItem } from '@/lib/management';

/**
 * GET /api/admin/navbar-editor/items — list all nav items (admin view,
 * display order). POST — add one. Guard: requireAdminArea('navbar-editor').
 * Includes `tablesReady` so the admin UI can show a "run the SQL" state
 * when the migration has not run yet. When the table is empty, GET also
 * returns `fromDefaults: true` — the navbar itself falls back to the
 * hardcoded items until an admin saves a config.
 */
export async function GET() {
  const auth = await requireAdminArea('navbar-editor');
  if ('error' in auth) return auth.error;
  const [items, tablesReady] = await Promise.all([listNavItems(), areNavItemTablesReady()]);
  return NextResponse.json({ items, tablesReady, fromDefaults: items.length === 0 });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('navbar-editor');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const v = body as Record<string, unknown>;
  const input = {
    label: typeof v.label === 'string' ? v.label : '',
    href: typeof v.href === 'string' ? v.href : '',
    order: typeof v.order === 'number' ? v.order : 0,
    enabled: typeof v.enabled === 'boolean' ? v.enabled : true,
  };
  const error = validateNavItem(input);
  if (error) return NextResponse.json({ error }, { status: 400 });
  try {
    const item = await createNavItem(input);
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not add the nav item';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not add the nav item' }, { status: 500 });
  }
}
