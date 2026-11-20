import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertNotViewAs, requireAdminArea } from '@/lib/api-helpers';
import { logAudit } from '@/lib/db/audit';
import {
  decideAmbassadorRedemption,
  isMissingAmbassadorCreditTableError,
  isMissingAmbassadorRedemptionTableError,
  AMBASSADOR_CREDIT_TABLE_MISSING_MESSAGE,
  AMBASSADOR_REDEMPTION_TABLE_MISSING_MESSAGE,
} from '@/lib/db/ambassador-credits';

const decideSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
});

/**
 * POST /api/admin/ambassador-redemptions/[id] — approve or reject an
 * ambassador redemption request (admin `credits` area). Approve: the
 * hold IS the deduction (the goody is issued, nothing more is
 * deducted). Reject: the held credits are released back to the
 * ambassador. View-as sessions are view-only (403). An
 * already-decided request is a 409.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('credits');
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = decideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Decision must be approved or rejected' }, { status: 400 });
  }
  try {
    const redemption = await decideAmbassadorRedemption(id, parsed.data.decision, auth.session.id);
    if (!redemption) {
      return NextResponse.json({ error: 'Redemption not found or already decided' }, { status: 409 });
    }
    try {
      await logAudit({
        actorId: auth.session.id,
        action: `ambassador-credits.redemption.${parsed.data.decision}`,
        entity: 'ambassador-redemption',
        entityId: redemption.id,
        detail: `${redemption.goody} (${redemption.creditsSpent} credits) for ${redemption.ambassadorId}`,
      });
    } catch (e) {
      console.error('[ambassador-credits] Failed to audit redemption decision', redemption.id, e);
    }
    return NextResponse.json({ redemption });
  } catch (e) {
    if (isMissingAmbassadorRedemptionTableError(e)) {
      return NextResponse.json({ error: AMBASSADOR_REDEMPTION_TABLE_MISSING_MESSAGE }, { status: 503 });
    }
    if (isMissingAmbassadorCreditTableError(e)) {
      return NextResponse.json({ error: AMBASSADOR_CREDIT_TABLE_MISSING_MESSAGE }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not decide this redemption' }, { status: 500 });
  }
}
