import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertNotViewAs, requireTeamMember } from '@/lib/api-helpers';
import { getTeamAccessByEmail, getTeamAccessByUserId } from '@/lib/db/team';
import {
  isMissingTeamCreditTableError,
  requestTeamRedemption,
  TEAM_CREDIT_TABLE_MISSING_MESSAGE,
} from '@/lib/db/team-credits';
import type { TeamGoody } from '@/lib/db/types';

const redeemSchema = z.object({
  goody: z.enum(['bottle', 'diary', 'pen', 'keychain']),
});

/**
 * POST /api/team/credits/redeem — request a goody for credits.
 * Team members only; view-as sessions are view-only (403). The
 * credits are held immediately (ledger hold entry) so the same
 * credits cannot be spent twice; an admin approves or rejects the
 * request from Credits Management.
 */
export async function POST(request: NextRequest) {
  const auth = await requireTeamMember();
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = redeemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Valid goody required (bottle, diary, pen, keychain)' }, { status: 400 });
  }
  const goody: TeamGoody = parsed.data.goody;
  try {
    const access =
      (await getTeamAccessByUserId(auth.session.id)) ?? (await getTeamAccessByEmail(auth.session.email));
    if (!access) {
      return NextResponse.json({ error: 'Team access required' }, { status: 403 });
    }
    const result = await requestTeamRedemption(access.id, goody);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ redemption: result.redemption });
  } catch (e) {
    if (isMissingTeamCreditTableError(e)) {
      return NextResponse.json({ error: TEAM_CREDIT_TABLE_MISSING_MESSAGE }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not request this goody' }, { status: 500 });
  }
}
