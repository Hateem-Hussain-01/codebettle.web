import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { acceptInvitation, getInvitationPreview } from '@/lib/services/invitation-service';
import { buildAdminPortalUrl } from '@/lib/email/resend';

/**
 * GET /api/auth/accept-invitation?token=… — preview an invitation for
 * the accept page (invitee name + email, prefilled read-only). Public:
 * the token is a 256-bit random value, so returning the invitee's
 * details for a valid token leaks nothing. Invalid, expired and used
 * tokens all get the same generic 400 — the page shows its error state.
 *
 * POST /api/auth/accept-invitation — accept an invitation. Public.
 * Body: { token, password, confirmPassword? }. The invitee sets their
 * OWN password (min 8); the stored grants are applied and the token is
 * consumed (single-use). No session is created — the invitee signs in
 * at the secret admin sign-in page afterwards (PR #33), whose URL is
 * returned as portalUrl so the accept page can show it with a save /
 * download option. The token is never returned in a response.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  if (!token) {
    return NextResponse.json({ error: 'Invitation token is required' }, { status: 400 });
  }
  const result = await getInvitationPreview(token);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}

const acceptSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
  confirmPassword: z.string().optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const parsed = acceptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Token and new password are required' }, { status: 400 });
  }
  const { token, password, confirmPassword } = parsed.data;
  if (confirmPassword !== undefined && confirmPassword !== password) {
    return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
  }
  const result = await acceptInvitation(token, password);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, portalUrl: buildAdminPortalUrl(request.nextUrl.origin) });
}
