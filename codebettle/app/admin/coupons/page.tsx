import { connection } from 'next/server';
import { listCoupons } from '@/lib/db/coupons';
import CouponsClient from './coupons-client';

/**
 * Admin coupons — server wrapper (Phase 2).
 * Fetches all coupons on the server and passes them to the client
 * component, which keeps the local add/toggle/delete state.
 */
export default async function AdminCouponsPage() {
  await connection();
  const coupons = await listCoupons();
  return <CouponsClient initialCoupons={coupons} />;
}
