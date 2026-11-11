import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireFullAdmin, serviceError } from '@/lib/api-helpers';
import {
  revokeAdminAccess,
  updateAdminAccess,
} from '@/lib/services/admin-access-service';

/**
 * PATCH /api/admin/access/users/[id] — grant admin access or update a
 * restricted admin's areas. Full admins only.
 *
 * Body: { permissions: { dashboard: true, courses: false, ... } }
 *   Grants admin access (or updates the areas) — at least one area must
 *   be true; all areas true grants FULL admin. The service refuses
 *   self-edits and restricting/revoking the last full admin.
 *
 * Body: { revoke: true }
 *   Revokes admin access (role back to student, sessions revoked).
 */
const patchSchema = z.object({
  permissions: z.record(z.string(), z.boolean()).optional(),
  revoke: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFullAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return invalidBody('Invalid request body');

  if (parsed.data.revoke === true) {
    const result = await revokeAdminAccess(auth.session.id, id);
    if ('error' in result) return serviceError(result);
    return NextResponse.json({ user: result.user });
  }

  if (parsed.data.permissions === undefined) {
    return invalidBody('Provide permissions to grant, or revoke: true');
  }
  const result = await updateAdminAccess(auth.session.id, id, {
    permissions: parsed.data.permissions,
  });
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ user: result.user });
}
