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

/**
 * Validate a coupon code for a specific course (Phase 3, P-3 /
 * MEDIUM-B2). Same validity checks as validateCoupon, plus the
 * course-applicability rule: a coupon whose `applicableCourses` list
 * is non-empty only applies to the courses named in it. An empty (or
 * missing) list means the coupon applies to every course — that is
 * the established seed convention (all seed coupons carry `[]`).
 */
export async function validateCouponForCourse(
  code: string,
  courseId: string,
  now: number = Date.now(),
): Promise<Coupon | null> {
  const coupon = await validateCoupon(code, now);
  if (!coupon) return null;
  const applicable = coupon.applicableCourses ?? [];
  if (applicable.length > 0 && !applicable.includes(courseId)) return null;
  return coupon;
}

/**
 * The exact amount a student must pay for a course with this coupon
 * (Phase 3, P-3 / MEDIUM-B2). The server computes it — the submitted
 * amount must equal this, exactly, at both submit time and approval
 * time. Percentage discounts round to the nearest rupee (Math.round);
 * a fixed discount never takes the price below zero.
 */
export function expectedDiscountedPrice(coursePrice: number, coupon: Coupon): number {
  if (coupon.type === 'percentage') {
    return Math.max(0, Math.round((coursePrice * (100 - coupon.value)) / 100));
  }
  return Math.max(0, coursePrice - coupon.value);
}
