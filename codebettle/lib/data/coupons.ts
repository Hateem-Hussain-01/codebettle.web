export interface Coupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  maxUses: number;
  usedCount: number;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
  applicableCourses?: string[];
}

export const coupons: Coupon[] = [
  { id: 'coup-1', code: 'WELCOME50', type: 'percentage', value: 50, maxUses: 100, usedCount: 34, expiresAt: '2024-12-31', isActive: true, createdAt: '2024-01-01' },
  { id: 'coup-2', code: 'SAVE1000', type: 'fixed', value: 1000, maxUses: 50, usedCount: 12, expiresAt: '2024-08-31', isActive: true, createdAt: '2024-03-01' },
  { id: 'coup-3', code: 'SUMMER25', type: 'percentage', value: 25, maxUses: 200, usedCount: 87, expiresAt: '2024-09-30', isActive: true, createdAt: '2024-06-01' },
  { id: 'coup-4', code: 'EARLYBIRD', type: 'percentage', value: 30, maxUses: 50, usedCount: 50, expiresAt: '2024-03-31', isActive: false, createdAt: '2024-01-01' },
];

export function validateCoupon(code: string) {
  const coupon = coupons.find(c => c.code.toUpperCase() === code.toUpperCase());
  if (!coupon) return null;
  if (!coupon.isActive) return null;
  if (coupon.usedCount >= coupon.maxUses) return null;
  if (new Date(coupon.expiresAt) < new Date()) return null;
  return coupon;
}
