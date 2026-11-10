/**
 * Email-verification service (auth UX upgrade).
 *
 * Mirrors the password-reset service: only SHA-256 hashes of tokens are
 * stored — never the raw token. A token is single-use (usedAt) and
 * expires after 24 hours. Requesting a new verification invalidates
 * earlier unused tokens for the same user. A successful verification
 * sets User.emailVerifiedAt.
 *
 * Login is NOT blocked for unverified users — verification is
 * informational only. Sending the email is best-effort: when Resend
 * is not configured (or the send fails), requestEmailVerification
 * still creates the token and returns { sent: false } — signup must
 * never fail because email is down.
 */
import { randomBytes, createHash } from 'node:crypto';
import { sendVerificationEmail, type EmailTransport } from '../email/resend';
import {
  EMAIL_VERIFICATION_TTL_MS,
  createEmailVerification,
  findEmailVerificationByTokenHash,
  markEmailVerificationUsed,
  markUserEmailVerified,
  revokeEmailVerificationsForUser,
} from '../db/email-verifications';
import { logAudit } from '../db/audit';

export function hashVerificationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface RequestVerificationOptions {
  now?: number;
  /** Test seam: fake Resend transport (see lib/email/resend.ts). */
  transport?: EmailTransport;
}

/**
 * Create a verification token for a new signup and send the
 * verification email. Never throws — a missing Resend key or a failed
 * send is logged by the email module and reported as { sent: false }.
 */
export async function requestEmailVerification(
  userId: string,
  email: string,
  name: string,
  baseUrl: string,
  opts: RequestVerificationOptions = {},
): Promise<{ sent: boolean }> {
  try {
    const now = opts.now ?? Date.now();
    await revokeEmailVerificationsForUser(userId);
    const token = randomBytes(32).toString('hex');
    await createEmailVerification(
      userId,
      hashVerificationToken(token),
      new Date(now + EMAIL_VERIFICATION_TTL_MS),
    );
    const result = await sendVerificationEmail(email, name, token, baseUrl, {
      transport: opts.transport,
    });
    return { sent: result.sent };
  } catch (error) {
    console.error('[email-verification] Failed to issue verification email:', error);
    return { sent: false };
  }
}

export interface VerifyEmailOptions {
  now?: number;
}

/**
 * Consume a verification token and mark the account verified. A used,
 * expired, or unknown token is rejected with the same generic message
 * as any other failure.
 */
export async function verifyEmail(
  token: string,
  opts: VerifyEmailOptions = {},
): Promise<{ success: true } | { error: string }> {
  const now = opts.now ?? Date.now();
  const record = await findEmailVerificationByTokenHash(hashVerificationToken(token));
  // `usedAt` may be null (real DB) or undefined (in-memory fake) — both mean unused.
  if (!record || record.usedAt != null || record.expiresAt.getTime() <= now) {
    return { error: 'This verification link is invalid or has expired' };
  }
  const used = await markEmailVerificationUsed(record.id);
  if (!used) return { error: 'This verification link is invalid or has expired' };
  await markUserEmailVerified(record.userId);
  await revokeEmailVerificationsForUser(record.userId);
  await logAudit({
    actorId: record.userId,
    action: 'user.email-verified',
    entity: 'user',
    entityId: record.userId,
  });
  return { success: true };
}
