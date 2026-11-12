import { NextResponse } from 'next/server';
import { listEnabledSocialLinks } from '@/lib/db/social-links';

/**
 * GET /api/social-links — public. The enabled footer social icons, in
 * display order. No auth: the footer is public.
 *
 * The footer falls back to the hardcoded defaults in lib/social.ts
 * when this returns an empty list — which is also what happens when
 * the SocialLink table does not exist yet (before the Phase 4
 * migration has run) or the database is unreachable. That failure is
 * deliberately swallowed here: a missing footer table must never
 * break the public site.
 */
export async function GET() {
  try {
    const links = await listEnabledSocialLinks();
    return NextResponse.json({ links });
  } catch {
    return NextResponse.json({ links: [] });
  }
}
