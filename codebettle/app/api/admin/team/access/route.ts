import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminArea } from '@/lib/api-helpers';
import {
  grantTeamAccess,
  isMissingTeamTableError,
  listTeamAccess,
  revokeTeamAccess,
  TEAM_TABLE_MISSING_MESSAGE,
} from '@/lib/db/team';

const grantSchema = z.object({ email: z.string().email() });

function teamTableError(e: unknown): NextResponse | null {
  if (isMissingTeamTableError(e)) {
    return NextResponse.json({ error: TEAM_TABLE_MISSING_MESSAGE }, { status: 503 });
  }
  return null;
}

/**
 * GET /api/admin/team/access — all team access grants (admin `team` area).
 * POST — grant team access by email (idempotent; re-activates a revoked
 * grant). DELETE ?email= — revoke (row stays for audit).
 */
export async function GET() {
  const auth = await requireAdminArea('team');
  if ('error' in auth) return auth.error;
  try {
    return NextResponse.json({ grants: await listTeamAccess() });
  } catch (e) {
    return teamTableError(e) ?? NextResponse.json({ error: 'Could not load team access' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('team');
  if ('error' in auth) return auth.error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }
  try {
    const grant = await grantTeamAccess({ email: parsed.data.email, grantedBy: auth.session.id });
    return NextResponse.json({ grant }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Valid email required') {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return teamTableError(e) ?? NextResponse.json({ error: 'Could not grant team access' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminArea('team');
  if ('error' in auth) return auth.error;
  const email = request.nextUrl.searchParams.get('email') ?? '';
  if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  try {
    const grant = await revokeTeamAccess(email);
    if (!grant) return NextResponse.json({ error: 'No team access grant for that email' }, { status: 404 });
    return NextResponse.json({ grant });
  } catch (e) {
    return teamTableError(e) ?? NextResponse.json({ error: 'Could not revoke team access' }, { status: 500 });
  }
}
