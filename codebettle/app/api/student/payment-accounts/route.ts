import { NextResponse } from 'next/server';
import { requireRoles } from '@/lib/api-helpers';
import { listActivePaymentAccounts } from '@/lib/db/payment-accounts';

/**
 * GET /api/student/payment-accounts — the ACTIVE payment accounts a
 * student pays into (Phase 1b). Student-only. Only `isActive`
 * accounts, ordered by displayOrder — never hardcoded in the client.
 * Accounts carry no admin-only fields (no credentials exist on the
 * model), so the full account shape is safe to return.
 */
export async function GET() {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const accounts = await listActivePaymentAccounts();
  return NextResponse.json({ accounts });
}
