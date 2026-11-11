import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireFullAdmin, serviceError } from '@/lib/api-helpers';
import {
  createInvitationForAdmin,
  listInvitationsForAdmin,
} from '@/lib/services/invitation-service';

/**
 * GET /api/admin/access/invitations — every invitation (newest first)
 * with a computed status (pending / used / expired). Full admins only.
 * The token hash is never returned; the raw token is only ever in the
 * create/resend response, inside the invite URL.
 *
 * POST /api/admin/access/invitations — invite a person with no account
 * yet (Case B of the "Grant Admin Access" flow). Full admins only.
 *
 * Body: { firstName, lastName, email, contactNumber?, isTeacher?,
 *         permissions?: { dashboard: true, ... } }
 *   permissions omitted (or every area true) = full admin; a partial
 *   map = restricted admin. The invitee sets their own password on
 *   accept — no password is ever supplied here.
 *
 * Success (201): { invitation, inviteUrl, emailSent }. When Resend is
 * not configured, emailSent is false and the admin copies inviteUrl
 * to share it by hand — the invitation is still created.
 * 409 when the email already has an account (grant to the existing
 * account instead) or already has a pending invitation.
 */
const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().min(1),
  contactNumber: z.string().optional(),
  isTeacher: z.boolean().optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
});

export async function GET() {
  const auth = await requireFullAdmin();
  if ('error' in auth) return auth.error;
  const result = await listInvitationsForAdmin(auth.session.id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ invitations: result.invitations });
}

export async function POST(request: NextRequest) {
  const auth = await requireFullAdmin();
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return invalidBody('First name, last name and a valid email are required');
  const result = await createInvitationForAdmin(auth.session.id, parsed.data, {
    baseUrl: request.nextUrl.origin,
  });
  if ('error' in result) return serviceError(result);
  return NextResponse.json(result, { status: 201 });
}
