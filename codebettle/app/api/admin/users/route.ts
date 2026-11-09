import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, toSafeUser } from '@/lib/auth';
import { getStudents } from '@/lib/data/users';
import { createManagedUser } from '@/lib/admin-users';

/**
 * GET /api/admin/users — list students (safe fields only, never the password hash).
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

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const students = getStudents().map(toSafeUser);
  return NextResponse.json({ users: students });
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
