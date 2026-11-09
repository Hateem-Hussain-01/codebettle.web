import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { deleteManagedUser, setUserStatus } from '@/lib/admin-users';

/**
 * PATCH /api/admin/users/[id] — suspend / activate a user (admin only).
 * Suspending revokes every session immediately, so the user is logged out.
 * DELETE /api/admin/users/[id] — soft-delete a user (admin only).
 * The row stays in the database (deletedAt set) so enrolments,
 * certificates and audit history keep their references.
 * Business logic lives in lib/services/admin-service.ts; this route only
 * enforces the admin gate and validates the request shape.
 */

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  if (session.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { session };
}

const patchSchema = z.object({
  status: z.enum(['active', 'suspended']),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Status must be active or suspended' }, { status: 400 });
  }

  const result = await setUserStatus(auth.session.id, id, parsed.data.status);
  if ('error' in result) {
    const status = result.error === 'User not found' ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ success: true, status: result.status });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const result = await deleteManagedUser(auth.session.id, id);
  if ('error' in result) {
    const status = result.error === 'User not found' ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ success: true });
}
