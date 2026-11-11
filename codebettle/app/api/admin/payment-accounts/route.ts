import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { paymentAccountCreateSchema } from '@/lib/api-schemas';
import {
  createPaymentAccountService,
  listPaymentAccountsService,
} from '@/lib/services/payment-account-service';

/**
 * GET /api/admin/payment-accounts — list all payment accounts, in
 * display order (admin only, `settings` area).
 * POST /api/admin/payment-accounts — create one (admin only).
 * Business logic lives in lib/services/payment-account-service.ts.
 * Payment-account data is RECEIVING-account info (account numbers /
 * holder names students pay into), not secrets — but writes are
 * admin-only (managePaymentAccounts capability).
 */
export async function GET() {
  const auth = await requireAdminArea('settings');
  if ('error' in auth) return auth.error;
  const result = await listPaymentAccountsService(auth.session);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ accounts: result.accounts });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('settings');
  if ('error' in auth) return auth.error;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = paymentAccountCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payment account details: provide a label, account holder, and an account number, IBAN or wallet number' },
      { status: 400 },
    );
  }
  const result = await createPaymentAccountService(auth.session, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ account: result.account }, { status: 201 });
}
