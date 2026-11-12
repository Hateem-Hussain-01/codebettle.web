/**
 * Shared API-route helpers (Phase 3).
 *
 * The same requireAdmin/parse-body shape the existing admin routes use,
 * factored out so the ~20 new Phase 3 routes stay consistent instead of
 * duplicating the guard in every file. Business logic still lives in the
 * services; these helpers only gate the request and shape the response.
 *
 * Test seam (same pattern as __setDbClient in lib/db/client.ts):
 * tests set an explicit session with __setTestSession — getSession() reads
 * cookies() from next/headers, which throws outside a Next request scope,
 * so route handlers cannot be unit-tested without this seam. Production
 * code never calls __setTestSession/__resetTestSession.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession, type SessionUser } from './auth';
import { hasAdminArea, hasAnyAdminArea, isFullAdmin, type AdminAreaKey } from './admin-access';
import { hasAdminCapability, hasTeacherCapability } from './rbac';
import { isSuperAdmin } from './super-admin';
import { logAudit } from './db/audit';
import type { UserRole } from './db/types';

/**
 * Phase 2: admin capability is the isAdmin FLAG (hasAdminCapability),
 * not the primary role alone — a teacher granted admin access keeps
 * the teacher flag and passes these guards. The helper also accepts
 * the legacy primary role 'admin', so pre-flag rows keep working.
 * Exported for layouts and services that need the same check without
 * going through a route guard.
 */
export { hasAdminCapability, hasTeacherCapability } from './rbac';

/** undefined = use the real session cookie; null/a user = test override. */
let testSession: SessionUser | null | undefined = undefined;

/** Test hook: force the session seen by route guards. Never call in production code. */
export function __setTestSession(session: SessionUser | null): void {
  testSession = session;
}

/** Test hook: restore real cookie-based sessions. Never call in production code. */
export function __resetTestSession(): void {
  testSession = undefined;
}

export async function getRequestSession(): Promise<SessionUser | null> {
  if (testSession !== undefined) return testSession;
  return getSession();
}

export async function requireSession(): Promise<
  { session: SessionUser } | { error: NextResponse }
> {
  const session = await getRequestSession();
  if (!session) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  return { session };
}

export async function requireAdmin(): Promise<
  { session: SessionUser } | { error: NextResponse }
> {
  const session = await getRequestSession();
  if (!session) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  if (!hasAdminCapability(session)) {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { session };
}

/**
 * Per-area admin gate (Item G). Same 401/403 shape as requireAdmin, plus
 * the area check: a restricted admin (a permissions map on the session)
 * is denied unless that area is granted. A full admin (no restriction)
 * passes every area. The permissions ride on the session, which
 * getSession() rebuilds from the user record on every request, so a
 * change made in /admin/access takes effect on the target's next request.
 */
export async function requireAdminArea(area: AdminAreaKey): Promise<
  { session: SessionUser } | { error: NextResponse }
> {
  const session = await getRequestSession();
  if (!session) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  if (!hasAdminCapability(session)) {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  if (!hasAdminArea(session.adminPermissions, area)) {
    return { error: NextResponse.json({ error: 'Access to this admin area is not granted' }, { status: 403 }) };
  }
  return { session };
}

/** Admin gate requiring at least one of the given areas (e.g. user management spans students + instructors). */
export async function requireAdminAreas(areas: readonly AdminAreaKey[]): Promise<
  { session: SessionUser } | { error: NextResponse }
> {
  const session = await getRequestSession();
  if (!session) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  if (!hasAdminCapability(session)) {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  if (!hasAnyAdminArea(session.adminPermissions, areas)) {
    return { error: NextResponse.json({ error: 'Access to this admin area is not granted' }, { status: 403 }) };
  }
  return { session };
}

/**
 * For routes open to non-admin roles too (e.g. instructors may write
 * blog posts): admins additionally need the area, other roles pass
 * through unchanged. Returns the 403 response when denied, else null.
 */
export function adminAreaError(session: SessionUser, area: AdminAreaKey): NextResponse | null {
  if (hasAdminCapability(session) && !hasAdminArea(session.adminPermissions, area)) {
    return NextResponse.json({ error: 'Access to this admin area is not granted' }, { status: 403 });
  }
  return null;
}

/**
 * Full-admin gate (Item G): admin capability AND no permissions
 * restriction. Only full admins may grant/revoke admin access or edit
 * permissions — a restricted admin must never be able to escalate
 * themselves.
 */
export async function requireFullAdmin(): Promise<
  { session: SessionUser } | { error: NextResponse }
> {
  const session = await getRequestSession();
  if (!session) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  if (!hasAdminCapability(session) || !isFullAdmin(session.adminPermissions)) {
    return { error: NextResponse.json({ error: 'Full admin access required' }, { status: 403 }) };
  }
  return { session };
}

/**
 * Official-admin gate (Phase 5, Module 23): the session must exist AND
 * belong to one of the two official administrators (isSuperAdmin in
 * lib/super-admin.ts — the email allowlist, never a label). Same
 * 401/403 shape as requireFullAdmin. The 403 message is deliberately
 * neutral: the concept exists only as access control, never as a label.
 */
export async function requireSuperAdmin(): Promise<
  { session: SessionUser } | { error: NextResponse }
> {
  const session = await getRequestSession();
  if (!session) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  if (!isSuperAdmin(session)) {
    return {
      error: NextResponse.json(
        { error: 'Access restricted to authorized administrators' },
        { status: 403 },
      ),
    };
  }
  return { session };
}

/**
 * Write an 'admin.audit.view-denied' AuditLog entry for a signed-in
 * user refused somewhere on the audit surface. Best-effort by design:
 * any failure (including no session at all) is swallowed — denial
 * logging must never break the 403 response it accompanies. Callers
 * that already hold the session pass it; otherwise the session is
 * re-read. The detail names the endpoint, except for the audit log
 * itself, which uses the plain "view the audit log" wording.
 */
export async function logDeniedAuditAttempt(
  endpoint: string,
  session?: SessionUser | null,
): Promise<void> {
  try {
    const user = session ?? (await getRequestSession());
    if (!user) return;
    await logAudit({
      actorId: user.id,
      action: 'admin.audit.view-denied',
      entity: 'audit_log',
      detail:
        endpoint === 'GET /api/admin/audit'
          ? `${user.email} attempted to view the audit log without access`
          : `${user.email} attempted to access ${endpoint} without access`,
    });
  } catch {
    // Denial logging must never break the 403 response.
  }
}

/**
 * Audit-log gate (Phase 5, Module 23): the session must exist, hold
 * admin capability, AND be an official administrator or carry the
 * explicit canViewAuditLog grant. A signed-in user denied here gets a
 * denial AuditLog entry FIRST (via logDeniedAuditAttempt above) and
 * then the 403 — the entry is written before the error is returned.
 */
export async function requireAuditLogAccess(
  endpoint = 'GET /api/admin/audit',
): Promise<{ session: SessionUser } | { error: NextResponse }> {
  const session = await getRequestSession();
  if (!session) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  if (
    !hasAdminCapability(session) ||
    (!isSuperAdmin(session) && session.canViewAuditLog !== true)
  ) {
    await logDeniedAuditAttempt(endpoint, session);
    return { error: NextResponse.json({ error: 'Audit log access is not granted' }, { status: 403 }) };
  }
  return { session };
}

/**
 * Role gate (Phase 2, flags-aware): a requested 'admin' entry is
 * satisfied by the isAdmin flag (or legacy primary role 'admin'), an
 * 'instructor' entry by the isTeacher flag (or legacy primary role
 * 'instructor'); 'student' stays primary-role only — flags never
 * confer student identity.
 */
export async function requireRoles(roles: UserRole[]): Promise<
  { session: SessionUser } | { error: NextResponse }
> {
  const session = await getRequestSession();
  if (!session) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  const passes = roles.some((role) =>
    role === 'admin'
      ? hasAdminCapability(session)
      : role === 'instructor'
        ? hasTeacherCapability(session)
        : session.role === role,
  );
  if (!passes) {
    return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
  }
  return { session };
}

/**
 * View-as mutation block (Phase 2, Module 21.4 — admin-assisted
 * teacher-portal viewing is VIEW-ONLY).
 *
 * While an admin is viewing a teacher's portal, the effective session
 * is the teacher (see getSession in lib/auth.ts) — so without this
 * check the admin could mutate the teacher's data through the normal
 * write routes. Every POST/PATCH/DELETE instructor, student and
 * profile route calls this right after its auth gate and returns the
 * 403 when it fires. Reads are unaffected (viewing is for looking).
 * The check reads the `viewAs` marker on the session, never the
 * cookie directly, so tests can set a viewing session with
 * __setTestSession and production code needs no extra plumbing.
 */
export function assertNotViewAs(session: SessionUser | null): NextResponse | null {
  if (session?.viewAs) {
    return NextResponse.json(
      {
        error:
          'You are viewing this portal as an admin. Changes are disabled while viewing — return to the Admin Panel to make changes.',
      },
      { status: 403 },
    );
  }
  return null;
}

/** Parse a JSON body. Returns null when the body is not valid JSON. */
export async function readJson(request: NextRequest): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function invalidBody(message = 'Invalid request body'): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Map a service `{ error, status }` result to its HTTP response. */
export function serviceError(result: { error: string; status: number }): NextResponse {
  return NextResponse.json({ error: result.error }, { status: result.status });
}
