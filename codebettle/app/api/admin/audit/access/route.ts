import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  invalidBody,
  logDeniedAuditAttempt,
  readJson,
  requireSuperAdmin,
  serviceError,
} from '@/lib/api-helpers';
import {
  grantAuditAccess,
  listAuditAccessUsers,
} from '@/lib/services/audit-access-service';
import type { SafeUser } from '@/lib/db/types';

/**
 * GET /api/admin/audit/access — who can view the audit log (Phase 5,
 * Module 23). Official administrators only; a signed-in non-official
 * gets a denial AuditLog entry first (see logDeniedAuditAttempt).
 *
 * Response: { officials: [{ id, name, email }],
 *             granted: [{ id, name, email }] } — officials are the two
 * official administrators (where a user row exists for them), granted
 * are the non-official admins explicitly given the flag.
 *
 * POST /api/admin/audit/access — grant audit-log viewing to an admin.
 * Official administrators only. Body: { userId }. The service refuses
 * unknown / inactive / non-admin targets (404/400); granting an
 * official or an already-granted admin is a no-op success.
 * Response: { user } (safe fields).
 */
const grantSchema = z.object({ userId: z.string().min(1) });

function toPublicUser(user: SafeUser): { id: string; name: string; email: string } {
  return { id: user.id, name: user.name, email: user.email };
}

export async function GET(_request: NextRequest) {
  const auth = await requireSuperAdmin();
  if ('error' in auth) {
    await logDeniedAuditAttempt('GET /api/admin/audit/access');
    return auth.error;
  }
  const result = await listAuditAccessUsers(auth.session.id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({
    officials: result.officials.map(toPublicUser),
    granted: result.granted.map(toPublicUser),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if ('error' in auth) {
    await logDeniedAuditAttempt('POST /api/admin/audit/access');
    return auth.error;
  }
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) return invalidBody('userId is required');
  const result = await grantAuditAccess(auth.session.id, parsed.data.userId);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ user: result.user });
}
