/**
 * Referral helpers (Ambassador referral tracking, Eman 16 Nov 2026;
 * redesigned 20 Nov 2026).
 *
 * Pure functions — no database, no Next.js imports — so they are
 * unit-testable on their own.
 *
 * Codes are 6 characters from a 32-character URL-safe alphabet that
 * excludes the ambiguous 0/O/1/I. They used to be RANDOM and
 * unguessable by design (auto-generated at approval); since 20 Nov
 * 2026 the ADMIN assigns every code (Eman's call) — generateReferralCode
 * survives only for the backfill of legacy approved rows and for
 * suggesting a code in the admin UI. With 32^6 combinations
 * (~1 billion) a guessed code is worthless, and the DB unique
 * constraint + regenerate-on-collision is the backstop.
 *
 * There is NO link tracking any more (Eman, 20 Nov 2026): the old
 * `?ref=` capture in proxy.ts + the `cb_ref` cookie + click counting
 * are gone. A student joins with a code they TYPE on the register
 * form — the code is only a lookup key, validated server-side
 * (exists / active / not self-referral / one attribution per user).
 */
import { randomInt } from 'node:crypto';

/** Referral codes are 6 characters (Eman's decision, 16 Nov 2026). */
export const REFERRAL_CODE_LENGTH = 6;

/** URL-safe alphanumeric, without the ambiguous 0/O/1/I. */
export const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Credits an ambassador earns per referred student (Eman's number,
 * 20 Nov 2026). Awarded on the referred student's FIRST enrollment
 * (see lib/db/ambassador-credits.ts) — one award per student ever,
 * not per enrollment.
 */
export const AMBASSADOR_CREDITS_PER_REFERRAL = 100;

/**
 * Discount (Rs) a referred student gets per enrollment when they
 * join with an ambassador's code (Eman's number, 20 Nov 2026). The
 * code IS a Coupon row (type fixed, value 200) — the server computes
 * the discounted price from it at payment creation (P-3 rule).
 */
export const AMBASSADOR_REFERRAL_DISCOUNT_PKR = 200;

/** One random referral code. `rand` is injectable for tests (defaults to crypto.randomInt). */
export function generateReferralCode(
  rand: (min: number, max: number) => number = randomInt,
): string {
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += REFERRAL_CODE_ALPHABET[rand(0, REFERRAL_CODE_ALPHABET.length)];
  }
  return code;
}

/** True when the string is exactly a referral code (6 chars from the alphabet). */
export function isReferralCodeFormat(code: string): boolean {
  if (code.length !== REFERRAL_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!REFERRAL_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

/** Trim + uppercase a raw referral-code value (codes are stored uppercase). */
export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase();
}
