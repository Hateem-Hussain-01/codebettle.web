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
import type { UserRole } from './db/types';

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
  if (session.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { session };
}

export async function requireRoles(roles: UserRole[]): Promise<
  { session: SessionUser } | { error: NextResponse }
> {
  const session = await getRequestSession();
  if (!session) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  if (!roles.includes(session.role)) {
    return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
  }
  return { session };
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
