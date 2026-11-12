import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { socialLinkUpdateSchema } from '@/lib/api-schemas';
import {
  deleteSocialLinkService,
  updateSocialLinkService,
} from '@/lib/services/social-link-service';

/**
 * PATCH /api/admin/social-links/[id] — edit an icon, including
 * enable/disable via `isEnabled` (admin only, `settings` area).
 * DELETE — delete an icon (admin only). When the last icon is
 * deleted the footer falls back to the hardcoded defaults.
 * Business logic lives in lib/services/social-link-service.ts.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('settings');
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = socialLinkUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid social link details' }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  const result = await updateSocialLinkService(auth.session, id, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ link: result.link });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('settings');
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const result = await deleteSocialLinkService(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ success: true });
}
