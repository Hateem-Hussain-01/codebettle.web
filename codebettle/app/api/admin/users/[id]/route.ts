import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api-helpers';
import { deleteManagedUser, setUserStatus, updateManagedUser } from '@/lib/admin-users';
import { userUpdateSchema } from '@/lib/api-schemas';
import { getCertificatesByStudent } from '@/lib/db/certificates';
import { getCourseById } from '@/lib/db/courses';
import { getEnrollmentsByStudent } from '@/lib/db/enrollments';
import { getUserById } from '@/lib/db/users';

/**
 * GET /api/admin/users/[id] — one user plus their enrolments and
 * certificates (admin only). Enrolments and certificates carry a
 * courseTitle so the admin detail view needs no extra lookups.
 * PUT /api/admin/users/[id] — edit a user's details (admin only).
 * Role changes are student <-> instructor only (never to admin, never
 * your own role); see lib/services/admin-service.ts updateManagedUser.
 * PATCH /api/admin/users/[id] — suspend / activate a user (admin only).
 * Suspending revokes every session immediately, so the user is logged out.
 * DELETE /api/admin/users/[id] — soft-delete a user (admin only).
 * The row stays in the database (deletedAt set) so enrolments,
 * certificates and audit history keep their references.
 * Business logic lives in lib/services/admin-service.ts; this route only
 * enforces the admin gate and validates the request shape. The admin gate
 * comes from lib/api-helpers so route tests can set a session without a
 * Next request scope (see __setTestSession there).
 */

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const user = await getUserById(id);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const [enrollments, certificates] = await Promise.all([
    getEnrollmentsByStudent(id),
    getCertificatesByStudent(id),
  ]);
  // One course-title lookup per distinct course (enrolments + certificates).
  const courseIds = [...new Set([...enrollments.map((e) => e.courseId), ...certificates.map((c) => c.courseId)])];
  const titles = new Map<string, string>();
  await Promise.all(
    courseIds.map(async (courseId) => {
      const course = await getCourseById(courseId);
      if (course) titles.set(courseId, course.title);
    }),
  );
  return NextResponse.json({
    user,
    enrollments: enrollments.map((e) => ({ ...e, courseTitle: titles.get(e.courseId) ?? 'Unknown course' })),
    certificates: certificates.map((c) => ({ ...c, courseTitle: titles.get(c.courseId) ?? 'Unknown course' })),
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const parsed = userUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid user details' }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const result = await updateManagedUser(auth.session.id, id, parsed.data);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ user: result.user });
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
