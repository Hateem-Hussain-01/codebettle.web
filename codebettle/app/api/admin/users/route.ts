import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminAreas } from '@/lib/api-helpers';
import { getAllUsers, listUsers } from '@/lib/db/users';
import { parsePageParams, toPage } from '@/lib/db/pagination';
import { hasAdminCapability, hasTeacherCapability } from '@/lib/rbac';
import { createManagedUser } from '@/lib/admin-users';

/**
 * GET /api/admin/users — list users (safe fields only, never the password hash).
 * Query params: page, limit, search (name match), role=all|student|instructor|admin.
 * Requires the `students` area (Item G).
 * - role=student (default): students only, via listUsers (backward compatible).
 * - role=instructor / role=admin: capability-based, not primary-role —
 *   a teacher+admin keeps the isTeacher flag with primary role 'admin',
 *   so the filter runs over the full safe-user list (getAllUsers) with
 *   the same search + pagination shape. Unknown role values fall back
 *   to 'student'.
 * POST /api/admin/users — create a student or instructor (admin only).
 * Passwords are hashed server-side with bcrypt; the caller can never set a role of admin.
 * Requires the `students` or `instructors` area (Item G).
 * Business logic lives in lib/admin-users.ts so it is unit-testable;
 * this route only enforces the admin gate and validates the request shape.
 */

const USER_ROLES = ['all', 'student', 'instructor', 'admin'] as const;
type UserSearchRole = (typeof USER_ROLES)[number];

export async function GET(request: NextRequest) {
  // Phase 7: the notification compose form's user picker calls this
  // endpoint, and the compose page requires the `notifications` area —
  // so the GET also passes for a notifications-area admin, not only
  // `students`. requireAdminAreas is ANY-of (hasAnyAdminArea).
  const auth = await requireAdminAreas(['students', 'notifications']);
  if ('error' in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const roleParam = params.get('role') ?? 'student';
  const role: UserSearchRole = (USER_ROLES as readonly string[]).includes(roleParam)
    ? (roleParam as UserSearchRole)
    : 'student';
  const search = params.get('search') ?? undefined;
  const pageParam = params.get('page') ?? undefined;
  const limitParam = params.get('limit') ?? undefined;

  if (role === 'student') {
    const page = await listUsers({
      role: 'student',
      search,
      page: pageParam,
      limit: limitParam,
    });
    return NextResponse.json({
      users: page.items,
      page: page.page,
      totalPages: page.totalPages,
      total: page.total,
    });
  }

  // Capability-aware roles (and 'all') cannot use listUsers' primary-role
  // filter — filter the full safe-user list in memory instead, then
  // paginate with the same shape.
  let users = await getAllUsers();
  if (role === 'instructor') users = users.filter((u) => hasTeacherCapability(u));
  if (role === 'admin') users = users.filter((u) => hasAdminCapability(u));
  const term = search?.trim().toLowerCase();
  if (term) {
    users = users.filter(
      (u) => u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term),
    );
  }
  const pageParams = parsePageParams({ page: pageParam, limit: limitParam });
  const page = toPage(
    users.slice(pageParams.offset, pageParams.offset + pageParams.limit),
    users.length,
    pageParams,
  );
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
  const auth = await requireAdminAreas(['students', 'instructors']);
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
