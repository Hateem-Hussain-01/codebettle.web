import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { getUserById, users } from '@/lib/data/users';
import { revokeAllSessionsForUser } from '@/lib/session-store';
import { logAudit } from '@/lib/audit';

/**
 * PATCH /api/admin/users/[id] — suspend / activate a user (admin only).
 * Suspending revokes every session immediately, so the user is logged out.
 * DELETE /api/admin/users/[id] — remove a user (admin only).
 * Phase 2 replaces hard delete with a soft delete (deleted_at).
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

  const user = getUserById(id);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.id === auth.session.id) {
    return NextResponse.json({ error: 'You cannot suspend your own account' }, { status: 400 });
  }

  user.status = parsed.data.status;
  if (parsed.data.status === 'suspended') {
    revokeAllSessionsForUser(user.id);
  }
  logAudit({
    actorId: auth.session.id,
    action: `admin.user.${parsed.data.status === 'suspended' ? 'suspend' : 'activate'}`,
    entity: 'user',
    entityId: user.id,
  });
  return NextResponse.json({ success: true, status: user.status });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const index = users.findIndex((u) => u.id === id);
  if (index === -1) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (users[index].id === auth.session.id) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
  }

  const [removed] = users.splice(index, 1);
  revokeAllSessionsForUser(removed.id);
  logAudit({
    actorId: auth.session.id,
    action: 'admin.user.delete',
    entity: 'user',
    entityId: removed.id,
    detail: removed.email,
  });
  return NextResponse.json({ success: true });
}
