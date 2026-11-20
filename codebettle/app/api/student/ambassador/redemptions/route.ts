import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertNotViewAs, invalidBody, readJson, requireRoles } from '@/lib/api-helpers';
import { getAmbassadorByUserId } from '@/lib/db/ambassadors';
import {
  isMissingAmbassadorCreditTableError,
  isMissingAmbassadorRedemptionTableError,
  requestAmbassadorRedemption,
  AMBASSADOR_CREDIT_TABLE_MISSING_MESSAGE,
  AMBASSADOR_REDEMPTION_TABLE_MISSING_MESSAGE,
} from '@/lib/db/ambassador-credits';
import type { TeamGoody } from '@/lib/db/types';

const redeemSchema = z.object({
  goody: z.enum(['bottle', 'diary', 'pen', 'keychain']),
});

/**
 * POST /api/student/ambassador/redemptions — request a goody for
 * credits. Ambassadors only; view-as sessions are view-only (403).
 * The credits are held immediately (ledger hold entry) so the same
 * credits cannot be spent twice; an admin approves or rejects the
 * request from Credits Management.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const body = await readJson(request);
  const parsed = redeemSchema.safeParse(body);
  if (!parsed.success) return invalidBody('Valid goody required (bottle, diary, pen, keychain)');
  const goody: TeamGoody = parsed.data.goody;
  try {
    const ambassador = await getAmbassadorByUserId(auth.session.id);
    if (!ambassador || ambassador.status !== 'active') {
      return NextResponse.json({ error: 'You are not an ambassador' }, { status: 404 });
    }
    const result = await requestAmbassadorRedemption(ambassador.id, goody);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ redemption: result.redemption });
  } catch (e) {
    if (isMissingAmbassadorRedemptionTableError(e)) {
      return NextResponse.json({ error: AMBASSADOR_REDEMPTION_TABLE_MISSING_MESSAGE }, { status: 503 });
    }
    if (isMissingAmbassadorCreditTableError(e)) {
      return NextResponse.json({ error: AMBASSADOR_CREDIT_TABLE_MISSING_MESSAGE }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not request this goody' }, { status: 500 });
  }
}
