import { NextResponse } from 'next/server';
import { getRealSession } from '@/lib/auth';
import { endViewAs } from '@/lib/services/recruitment-service';
import { VIEW_AS_COOKIE } from '@/lib/view-as';

/**
 * POST /api/admin/view-as/exit — leave the teacher portal and return
 * to the Admin Panel. Clears the view-as cookie and audit-logs the
 * end of the viewing session.
 *
 * Uses the REAL admin session (getRealSession), not the overlaid
 * view-as session: while viewing, getSession() returns the teacher,
 * so the ordinary admin gate would refuse this call. Clearing the
 * cookie is safe for anyone holding a valid admin session.
 */
export async function POST() {
  const real = await getRealSession();
  if (!real) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  await endViewAs(real);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(VIEW_AS_COOKIE);
  return response;
}
