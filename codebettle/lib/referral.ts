/**
 * Referral helpers (Ambassador referral tracking, Eman 16 Nov 2026).
 *
 * Pure functions — no database, no Next.js imports — so they are
 * unit-testable on their own.
 *
 * Codes are RANDOM and unguessable by design (Eman's explicit call):
 * 10 characters from a 32-character URL-safe alphabet that excludes
 * the ambiguous 0/O/1/I, drawn with crypto.randomInt. With 32^10
 * combinations a guessed code is worthless, and the DB unique
 * constraint + regenerate-on-collision is the backstop.
 */
import { randomInt } from 'node:crypto';

/** Referral codes are 10 characters (Eman's confirmed decision). */
export const REFERRAL_CODE_LENGTH = 10;

/** URL-safe alphanumeric, without the ambiguous 0/O/1/I. */
export const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** The cookie that carries a referral code from landing to signup. */
export const REFERRAL_COOKIE = 'cb_ref';

/** How long the referral cookie lives (30 days). */
export const REFERRAL_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

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

/** True when the string is exactly a referral code (10 chars from the alphabet). */
export function isReferralCodeFormat(code: string): boolean {
  if (code.length !== REFERRAL_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!REFERRAL_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

/** Trim + uppercase a raw `?ref=` value (codes are stored uppercase). */
export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** The full referral link for a code: `<baseUrl>/?ref=<CODE>`. */
export function buildReferralLink(code: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/?ref=${code}`;
}

/** UTC calendar date (YYYY-MM-DD) of a click — the dedupe key for click counts. */
export function utcDayString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
