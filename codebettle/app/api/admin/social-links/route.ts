import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { socialLinkCreateSchema } from '@/lib/api-schemas';
import {
  createSocialLinkService,
  listSocialLinksService,
} from '@/lib/services/social-link-service';

/**
 * GET /api/admin/social-links — list all footer social icons, in
 * display order (admin only, `settings` area — same area as the
 * payment accounts managed on the same settings page).
 * POST /api/admin/social-links — add one (admin only).
 * Business logic lives in lib/services/social-link-service.ts. Only
 * two things are required per icon: Icon Name and Icon Link. The icon
 * itself is auto-fetched from the name — no image upload.
 */
export async function GET() {
  const auth = await requireAdminArea('settings');
  if ('error' in auth) return auth.error;
  const result = await listSocialLinksService(auth.session);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ links: result.links });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('settings');
  if ('error' in auth) return auth.error;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = socialLinkCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid social link: provide an icon name and a valid https:// URL or mailto: address' },
      { status: 400 },
    );
  }
  const result = await createSocialLinkService(auth.session, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ link: result.link }, { status: 201 });
}
