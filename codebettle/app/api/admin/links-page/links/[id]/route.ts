import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import { validateLink } from '@/lib/links';
import { deleteLink, getLinkById, updateLink } from '@/lib/db/links';

/**
 * PATCH /api/admin/links-page/links/[id] — edit a link (label, URL,
 * icon, order, enable/disable). DELETE — real DB delete. Guard:
 * requireAdminArea('links-page').
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('links-page');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const v = body as Record<string, unknown>;
  const input: { label?: string; url?: string; icon?: string; order?: number; enabled?: boolean } = {};
  if (typeof v.label === 'string') input.label = v.label;
  if (typeof v.url === 'string') input.url = v.url;
  if (typeof v.icon === 'string') input.icon = v.icon;
  if (typeof v.order === 'number') input.order = v.order;
  if (typeof v.enabled === 'boolean') input.enabled = v.enabled;
  const existing = await getLinkById(id);
  if (!existing) return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  const merged = { label: input.label ?? existing.label, url: input.url ?? existing.url, icon: input.icon ?? existing.icon };
  const error = validateLink(merged);
  if (error) return NextResponse.json({ error }, { status: 400 });
  try {
    const link = await updateLink(id, input);
    if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    return NextResponse.json({ link });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not update the link';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not update the link' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('links-page');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  try {
    const deleted = await deleteLink(id);
    if (!deleted) return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not delete the link';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not delete the link' }, { status: 500 });
  }
}
