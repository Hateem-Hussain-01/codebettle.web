import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import { validateLink } from '@/lib/links';
import {
  areLinkTablesReady,
  createLink,
  listLinks,
} from '@/lib/db/links';

/**
 * GET /api/admin/links-page/links — list all links (admin view,
 * display order). POST — add one. Guard: requireAdminArea('links-page').
 * Includes `tablesReady` so the admin UI can show a "run the SQL" state
 * when the migration has not run yet.
 */
export async function GET() {
  const auth = await requireAdminArea('links-page');
  if ('error' in auth) return auth.error;
  const [links, tablesReady] = await Promise.all([listLinks(), areLinkTablesReady()]);
  return NextResponse.json({ links, tablesReady });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('links-page');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const v = body as Record<string, unknown>;
  const input = {
    label: typeof v.label === 'string' ? v.label : '',
    url: typeof v.url === 'string' ? v.url : '',
    icon: typeof v.icon === 'string' ? v.icon : 'link',
    order: typeof v.order === 'number' ? v.order : 0,
    enabled: typeof v.enabled === 'boolean' ? v.enabled : true,
  };
  const error = validateLink(input);
  if (error) return NextResponse.json({ error }, { status: 400 });
  try {
    const link = await createLink(input);
    return NextResponse.json({ link }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not add the link';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not add the link' }, { status: 500 });
  }
}
