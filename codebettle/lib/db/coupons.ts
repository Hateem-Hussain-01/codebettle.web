/**
 * Coupon repository (Phase 2, Prisma-backed).
 *
 * Same validateCoupon behaviour as the old lib/data/coupons.ts: inactive,
 * fully-used, or expired coupons are rejected. Expiry is judged against
 * the current time; the seed coupons are all expired in 2024 (they are
 * historical data, not live offers).
 */
import { getDb } from './client';
import { mapCouponRow } from './mappers';
import type { Coupon } from './types';

export async function getCouponByCode(code: string): Promise<Coupon | null> {
  const row = await getDb()
    .orm.public.Coupon.where((c) => c.code.eq(code.toUpperCase()))
    .first();
  if (!row) return null;
  return mapCouponRow(row);
}

export async function listCoupons(): Promise<Coupon[]> {
  const rows = await getDb()
    .orm.public.Coupon.orderBy((c) => c.createdAt.desc())
    .all();
  return rows.map(mapCouponRow);
}

/** Validate a coupon code. Returns the coupon, or null when it cannot be used. */
export async function validateCoupon(code: string, now: number = Date.now()): Promise<Coupon | null> {
  const coupon = await getCouponByCode(code);
  if (!coupon) return null;
  if (!coupon.isActive) return null;
  if (coupon.usedCount >= coupon.maxUses) return null;
  if (new Date(coupon.expiresAt).getTime() < now) return null;
  return coupon;
}
