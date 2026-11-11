import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { paymentAccountUpdateSchema } from '@/lib/api-schemas';
import {
  deletePaymentAccountService,
  updatePaymentAccountService,
} from '@/lib/services/payment-account-service';

/**
 * PATCH /api/admin/payment-accounts/[id] — edit an account, including
 * activate/deactivate via `isActive` (admin only, `settings` area).
 * DELETE — delete an account (admin only). Past payment submissions
 * keep their frozen account snapshot, so deleting never rewrites history.
 * Business logic lives in lib/services/payment-account-service.ts.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('settings');
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = paymentAccountUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payment account details' }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  const result = await updatePaymentAccountService(auth.session, id, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ account: result.account });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('settings');
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const result = await deletePaymentAccountService(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ success: true });
}
