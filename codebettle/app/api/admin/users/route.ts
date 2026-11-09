import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { listUsers } from '@/lib/db/users';
import { createManagedUser } from '@/lib/admin-users';

/**
 * GET /api/admin/users — list students (safe fields only, never the password hash).
 * Query params: page, limit, search (name match). Returns
 * { users, page, totalPages, total }.
 * POST /api/admin/users — create a student or instructor (admin only).
 * Passwords are hashed server-side with bcrypt; the caller can never set a role of admin.
 * Business logic lives in lib/admin-users.ts so it is unit-testable;
 * this route only enforces the admin gate and validates the request shape.
 */

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  if (session.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { session };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const page = await listUsers({
    role: 'student',
    search: params.get('search') ?? undefined,
    page: params.get('page') ?? undefined,
    limit: params.get('limit') ?? undefined,
  });
  return NextResponse.json({
    users: page.items,
    page: page.page,
    totalPages: page.totalPages,
    total: page.total,
  });
}

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().min(1),
  password: z.string().min(1),
  role: z.enum(['student', 'instructor']).optional().default('student'),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Name, email and password are required' }, { status: 400 });
  }
  const result = await createManagedUser(auth.session.id, parsed.data);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ user: result.user }, { status: 201 });
}
