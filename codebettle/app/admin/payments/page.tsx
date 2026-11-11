import { connection } from 'next/server';
import PaymentsClient from './payments-client';

/**
 * Admin payment verifications — server wrapper (Phase 1c).
 * The submission list itself is fetched client-side from
 * GET /api/admin/payments (pending first). The wrapper renders
 * nothing from the database; the route guards the data.
 */
export default async function AdminPaymentsPage() {
  await connection();
  return <PaymentsClient />;
}
