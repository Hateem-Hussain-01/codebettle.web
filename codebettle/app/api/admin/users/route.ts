import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, toSafeUser } from '@/lib/auth';
import { getStudents, getUserByEmail, users, type User } from '@/lib/data/users';
import { hashPassword, normalizeEmail, validatePassword } from '@/lib/security';
import { logAudit } from '@/lib/audit';

/**
 * GET /api/admin/users — list students (safe fields only, never the password hash).
 * POST /api/admin/users — create a student or instructor (admin only).
 * Passwords are hashed server-side with bcrypt; the caller can never set a role of admin.
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
  const { name, role } = parsed.data;
  const email = normalizeEmail(parsed.data.email);
  const passwordError = validatePassword(parsed.data.password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }
  if (getUserByEmail(email)) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 400 });
  }

  const newUser: User = {
    id: `${role}-${Date.now()}`,
    name: name.trim(),
    email,
    passwordHash: await hashPassword(parsed.data.password),
    role,
    avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name.trim())}&backgroundColor=1C1C1C&textColor=F5C518`,
    status: 'active',
    joinedAt: new Date().toISOString().split('T')[0],
    enrolledCourses: [],
    wishlist: [],
  };
  users.push(newUser);
  logAudit({
    actorId: auth.session.id,
    action: 'admin.user.create',
    entity: 'user',
    entityId: newUser.id,
    detail: `${role} ${email}`,
  });
  return NextResponse.json({ user: toSafeUser(newUser) }, { status: 201 });
}
