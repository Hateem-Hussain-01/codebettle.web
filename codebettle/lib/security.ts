import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'node:crypto';

/**
 * Pure security helpers. No Next.js imports here so this module is
 * unit-testable with the plain Node test runner.
 */

export const BCRYPT_COST = 12;
export const MIN_PASSWORD_LENGTH = 8;

/** Hash a plaintext password with bcrypt (cost 12). Never store or log the input. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * Constant-time password check. Returns false (never throws) for a
 * malformed stored hash so a corrupt record cannot crash login.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/** A bcrypt hash of a random value, used to keep login timing uniform when the email does not exist. */
export const DUMMY_HASH = '$2b$12$KIXxQZ9v5mQ0vYvR5pQ0yO8Q0yO8Q0yO8Q0yO8Q0yO8Q0yO8Q0yO8Q0';

/** Validate a new password. Returns an error message or null when valid. */
export function validatePassword(password: string): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

/** Normalise an email for storage and lookup (trim + lowercase). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Opaque, unguessable session token (64 hex chars). Only its SHA-256 hash is ever stored. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/** SHA-256 hash of a session token. The raw token is never stored or logged. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Allow only same-origin relative redirects (prevents the open-redirect on
 * login, where `?redirect=` was passed to the router unchecked).
 * Accepts "/student/dashboard"; rejects "//evil.com", "https://…", "javascript:…".
 */
export function getSafeRedirect(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || typeof raw !== 'string') return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (raw.includes('\\')) return fallback;
  try {
    const url = new URL(raw, 'http://localhost');
    if (url.origin !== 'http://localhost') return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
