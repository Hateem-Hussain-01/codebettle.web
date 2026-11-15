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
import { getAppBaseUrl, sendEmail, sendVerificationEmail, type EmailTransport } from '../email/resend';
import { getUserByEmail, getUserById, updateUser } from '../db/users';
import { revokeAllSessionsForUser } from '../db/sessions';
import { isOfficialAdminEmail } from './first-run';
import { normalizeEmail } from '../security';
import {
  EMAIL_VERIFICATION_TTL_MS,
  createEmailVerification,
  findEmailVerificationByTokenHash,
  getUserEmailVerifiedAt,
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

// ---------------------------------------------------------------------------
// MEDIUM-A2 — verification status (login enforcement reads this).
// ---------------------------------------------------------------------------

/** True when the user's email is verified. False for unknown users. */
export async function isUserEmailVerified(userId: string): Promise<boolean> {
  try {
    return (await getUserEmailVerifiedAt(userId)) !== null;
  } catch {
    return false;
  }
}

/**
 * Verification status for one email address, for the login route's
 * "verify your email" response. 'unknown' when no account exists, so
 * the route can keep the generic 401 for unknown emails.
 */
export async function getEmailVerificationStatus(
  email: string,
): Promise<'verified' | 'unverified' | 'unknown'> {
  const user = await getUserByEmail(normalizeEmail(email));
  if (!user) return 'unknown';
  return (await isUserEmailVerified(user.id)) ? 'verified' : 'unverified';
}

// ---------------------------------------------------------------------------
// CRITICAL-A2 — verification-gated email change (always enforced).
// ---------------------------------------------------------------------------

/**
 * Domain-separated hash for email-change tokens. The token is bound to
 * the NEW address: a token minted for address A cannot confirm a
 * change to address B (the lookup recomputes the hash with the
 * presented address). `allowOfficial` binds a second fact into the
 * hash: whether a SUPER-ADMIN authorized this change to target an
 * official-admin email (CRITICAL-A2 (a)). A token minted without that
 * authorization can never confirm an official address, however it is
 * presented — the confirm step re-derives the hash both ways and
 * only honours the official path for the super-admin-bound hash.
 * Stored the same way as verification tokens — only the SHA-256 hash,
 * never the raw token — in the existing EmailVerification table, so
 * no schema change is needed. Single-use (usedAt) and 24-hour expiry,
 * like signup verification.
 */
export function hashEmailChangeToken(
  token: string,
  newEmail: string,
  allowOfficial = false,
): string {
  return createHash('sha256')
    .update(`email-change:${allowOfficial ? 'official:' : ''}${normalizeEmail(newEmail)}:${token}`)
    .digest('hex');
}

export interface RequestEmailChangeOptions {
  now?: number;
  /** Test seam: fake Resend transport (see lib/email/resend.ts). */
  transport?: EmailTransport;
  /**
   * True only when a super-admin authorized this change (CRITICAL-A2
   * (a)). Binds the authorization into the token hash so the confirm
   * step can tell a super-admin-authorized official-address change
   * from an ordinary one. Never true for a restricted admin.
   */
  allowOfficialAdminEmail?: boolean;
}

/**
 * Start a verification-gated email change (CRITICAL-A2). The user's
 * email is NOT changed here. A single-use token is stored (hashed)
 * and a confirmation link is sent to the NEW address only — the
 * change takes effect only when confirmEmailChange consumes that
 * token. Never throws: a missing Resend key or a failed send is
 * reported as { sent: false } and the caller reports the pending
 * state; the admin/user can retry once Resend is configured.
 *
 * Note: this revokes the user's earlier unused verification tokens
 * (same as requesting a new signup verification) — a pending signup
 * verification is superseded by the change token.
 */
export async function requestEmailChange(
  userId: string,
  newEmail: string,
  baseUrl: string,
  opts: RequestEmailChangeOptions = {},
): Promise<{ sent: boolean }> {
  try {
    const now = opts.now ?? Date.now();
    const user = await getUserById(userId);
    if (!user) return { sent: false };
    const normalized = normalizeEmail(newEmail);
    await revokeEmailVerificationsForUser(userId);
    const token = randomBytes(32).toString('hex');
    await createEmailVerification(
      userId,
      hashEmailChangeToken(token, normalized, opts.allowOfficialAdminEmail === true),
      new Date(now + EMAIL_VERIFICATION_TTL_MS),
    );
    const confirmUrl =
      `${getAppBaseUrl(baseUrl)}/auth/confirm-email-change?token=${token}` +
      `&email=${encodeURIComponent(normalized)}`;
    const result = await sendEmail(
      {
        to: normalized,
        subject: 'Confirm your new CodeBettle email address',
        html:
          `<p>Hi ${escapeHtml(user.name)},</p>` +
          `<p>Your CodeBettle email address will change from ${escapeHtml(user.email)} ` +
          `to ${escapeHtml(normalized)}. Please confirm this change by clicking the link below:</p>` +
          `<p><a href="${confirmUrl}">Confirm my new email address</a></p>` +
          `<p>This link expires in 24 hours and can only be used once. If you did not request ` +
          `this change, ignore this email — your address stays unchanged.</p>`,
        text:
          `Hi ${user.name},\n\nYour CodeBettle email address will change from ${user.email} ` +
          `to ${normalized}. Confirm it here (expires in 24 hours, single-use):\n${confirmUrl}\n\n` +
          `If you did not request this change, ignore this email — your address stays unchanged.`,
      },
      { transport: opts.transport },
    );
    return { sent: result.sent };
  } catch (error) {
    console.error('[email-change] Failed to issue email-change confirmation:', error);
    return { sent: false };
  }
}

/** Minimal HTML escaping for the values interpolated into the change email. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface ConfirmEmailChangeOptions {
  now?: number;
}

/**
 * Consume an email-change token and apply the pending email change.
 * The token proves control of the NEW address (it was only sent
 * there). On success the user's email changes, the new address is
 * marked verified, and ALL of the user's sessions are revoked (the
 * old sessions belong to the old identity — CRITICAL-A2 chain B
 * defence). Guards re-checked here, not just at request time: the
 * new address must still be free, and a change TO an official admin
 * email is honoured only when the token was minted with
 * super-admin authorization bound into it (CRITICAL-A2 (a)) — an
 * ordinary token can never confirm an official address. The token
 * is single-use.
 */
export async function confirmEmailChange(
  token: string,
  newEmail: string,
  opts: ConfirmEmailChangeOptions = {},
): Promise<{ success: true; email: string } | { error: string }> {
  const normalized = normalizeEmail(newEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { error: 'This confirmation link is invalid or has expired' };
  }
  const now = opts.now ?? Date.now();
  // The token hash is bound to the new address AND to whether a
  // super-admin authorized an official-address change. Try the
  // ordinary hash first, then the super-admin-bound one: only the
  // latter may confirm a change TO an official-admin email.
  let record = await findEmailVerificationByTokenHash(hashEmailChangeToken(token, normalized, false));
  let allowOfficial = false;
  if (!record) {
    record = await findEmailVerificationByTokenHash(hashEmailChangeToken(token, normalized, true));
    allowOfficial = record !== null;
  }
  // `usedAt` may be null (real DB) or undefined (in-memory fake) — both mean unused.
  if (!record || record.usedAt != null || record.expiresAt.getTime() <= now) {
    return { error: 'This confirmation link is invalid or has expired' };
  }
  if (isOfficialAdminEmail(normalized) && !allowOfficial) {
    return { error: 'This confirmation link is invalid or has expired' };
  }
  // Single-use first: a concurrent second confirm loses the race here.
  const used = await markEmailVerificationUsed(record.id);
  if (!used) return { error: 'This confirmation link is invalid or has expired' };
  const user = await getUserById(record.userId);
  if (!user) return { error: 'This confirmation link is invalid or has expired' };
  if (user.email === normalized) {
    return { error: 'This email change has already been applied' };
  }
  const existing = await getUserByEmail(normalized);
  if (existing && existing.id !== user.id) {
    return { error: 'An account with this email already exists' };
  }
  const updated = await updateUser(user.id, { email: normalized });
  if (!updated) return { error: 'This confirmation link is invalid or has expired' };
  await markUserEmailVerified(user.id);
  await revokeEmailVerificationsForUser(user.id);
  await revokeAllSessionsForUser(user.id);
  await logAudit({
    actorId: user.id,
    action: 'user.email-changed',
    entity: 'user',
    entityId: user.id,
    detail: `${user.email} -> ${normalized}`,
  });
  return { success: true, email: normalized };
}
