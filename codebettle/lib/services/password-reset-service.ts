/**
 * Password-reset service (Phase 2).
 *
 * Token machinery, fully implemented and tested. Only SHA-256 hashes of
 * tokens are stored — never the raw token. A token is single-use
 * (usedAt) and expires after 60 minutes. Requesting a new reset
 * invalidates earlier unused tokens for the same user. A successful
 * reset revokes every session, so a stolen session dies with the old
 * password.
 *
 * KNOWN GAP — email delivery is NOT configured yet (Resend + Eman's
 * domain are pending; see RUNBOOK.md). The service takes an injected
 * `deliver` callback so tests can capture the token; the API route
 * currently passes no deliver function, so a requested token is created
 * but never reaches the user. Do NOT surface the token in an HTTP
 * response — that would let anyone reset anyone's password.
 */
import { randomBytes, createHash } from 'node:crypto';
import { hashPassword, normalizeEmail, validatePassword } from '../security';
import { getUserByEmail, updateUserPassword } from '../db/users';
import {
  PASSWORD_RESET_TTL_MS,
  createPasswordReset,
  findPasswordResetByTokenHash,
  markPasswordResetUsed,
  revokePasswordResetsForUser,
} from '../db/password-resets';
import { revokeAllSessionsForUser } from '../db/sessions';
import { logAudit } from '../db/audit';

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface RequestResetOptions {
  /** Called with (email, rawToken) when a token is issued. Omit until email delivery exists. */
  deliver?: (email: string, token: string) => Promise<void>;
  now?: number;
}

/**
 * Request a password reset. Always returns ok — never reveals whether
 * the email has an account (no enumeration oracle).
 */
export async function requestPasswordReset(
  email: string,
  opts: RequestResetOptions = {},
): Promise<{ ok: true }> {
  const normalized = normalizeEmail(email);
  const user = await getUserByEmail(normalized);
  if (!user) return { ok: true };
  const now = opts.now ?? Date.now();
  await revokePasswordResetsForUser(user.id);
  const token = randomBytes(32).toString('hex');
  await createPasswordReset(user.id, hashResetToken(token), new Date(now + PASSWORD_RESET_TTL_MS));
  if (opts.deliver) await opts.deliver(normalized, token);
  return { ok: true };
}

export interface ResetPasswordOptions {
  now?: number;
}

/**
 * Consume a reset token and set a new password. The token is single-use;
 * a used, expired, or unknown token is rejected with the same generic
 * message as any other failure.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
  opts: ResetPasswordOptions = {},
): Promise<{ success: true } | { error: string }> {
  const now = opts.now ?? Date.now();
  const record = await findPasswordResetByTokenHash(hashResetToken(token));
  if (!record || record.usedAt !== null || record.expiresAt.getTime() <= now) {
    return { error: 'This reset link is invalid or has expired' };
  }
  const passwordError = validatePassword(newPassword);
  if (passwordError) return { error: passwordError };
  const used = await markPasswordResetUsed(record.id);
  if (!used) return { error: 'This reset link is invalid or has expired' };
  await updateUserPassword(record.userId, await hashPassword(newPassword));
  await revokeAllSessionsForUser(record.userId);
  await revokePasswordResetsForUser(record.userId);
  await logAudit({
    actorId: record.userId,
    action: 'user.password-reset',
    entity: 'user',
    entityId: record.userId,
  });
  return { success: true };
}
