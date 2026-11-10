/**
 * Email-verification tokens (auth UX upgrade, Prisma-backed).
 *
 * Same pattern as lib/db/password-resets.ts: only SHA-256 hashes of
 * tokens are stored — never the raw token. A token is single-use
 * (usedAt) and expires after 24 hours. Requesting a new verification
 * invalidates earlier unused tokens for the same user. Consuming a
 * token sets User.emailVerifiedAt (see markUserEmailVerified).
 *
 * Login is NOT blocked for unverified users — verification is
 * informational only.
 */
import { getDb } from './client';

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface EmailVerificationRecord {
  id: string;
  userId: string;
  /** SHA-256 hash of the raw token. The raw token is never stored. */
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export async function createEmailVerification(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<EmailVerificationRecord> {
  const row = await getDb().orm.public.EmailVerification.create({
    userId,
    tokenHash,
    expiresAt,
  });
  return row;
}

export async function findEmailVerificationByTokenHash(
  tokenHash: string,
): Promise<EmailVerificationRecord | null> {
  const row = await getDb().orm.public.EmailVerification.where({ tokenHash }).first();
  return row ?? null;
}

export async function markEmailVerificationUsed(id: string): Promise<boolean> {
  const row = await getDb()
    .orm.public.EmailVerification.where({ id })
    .where((v) => v.usedAt.isNull())
    .update({ usedAt: new Date() });
  return row !== null;
}

/** Delete all unused verification tokens for a user (new request, or after a successful verification). Returns how many were removed. */
export async function revokeEmailVerificationsForUser(userId: string): Promise<number> {
  const rows = await getDb()
    .orm.public.EmailVerification.where({ userId })
    .where((v) => v.usedAt.isNull())
    .select('id')
    .all();
  if (rows.length === 0) return 0;
  await getDb()
    .orm.public.EmailVerification.where({ userId })
    .where((v) => v.usedAt.isNull())
    .deleteAll();
  return rows.length;
}

/** Mark a user's email as verified. Returns false when the user does not exist (or is soft-deleted). */
export async function markUserEmailVerified(userId: string): Promise<boolean> {
  const row = await getDb()
    .orm.public.User.where({ id: userId })
    .where((u) => u.deletedAt.isNull())
    .update({ emailVerifiedAt: new Date() });
  return row !== null;
}
