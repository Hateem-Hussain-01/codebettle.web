import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, requireFullAdmin } from '@/lib/api-helpers';
import { deleteNavItem, getNavItemById, updateNavItem } from '@/lib/db/nav-items';
import { validateNavItem } from '@/lib/management';

/**
 * PATCH /api/admin/navbar-editor/items/[id] — edit a nav item (label,
 * href, order, enabled toggle). Guard: requireAdminArea('navbar-editor').
 *
 * DELETE — remove a nav item. Guard: requireFullAdmin (destructive).
 * Deleting every item returns the navbar to its hardcoded fallback.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('navbar-editor');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const current = await getNavItemById(id);
  if (!current) return NextResponse.json({ error: 'Nav item not found' }, { status: 404 });
  const v = body as Record<string, unknown>;
  const merged = {
    label: typeof v.label === 'string' ? v.label : current.label,
    href: typeof v.href === 'string' ? v.href : current.href,
    order: typeof v.order === 'number' ? v.order : current.order,
  };
  const error = validateNavItem(merged);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const patch: Record<string, unknown> = { ...merged };
  if (typeof v.enabled === 'boolean') patch.enabled = v.enabled;
  try {
    const item = await updateNavItem(id, patch);
    if (!item) return NextResponse.json({ error: 'Nav item not found' }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not update the nav item';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not update the nav item' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireFullAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  try {
    const deleted = await deleteNavItem(id);
    if (!deleted) return NextResponse.json({ error: 'Nav item not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not delete the nav item';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not delete the nav item' }, { status: 500 });
  }
}
