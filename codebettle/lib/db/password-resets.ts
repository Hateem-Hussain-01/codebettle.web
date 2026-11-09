/**
 * Password-reset tokens (Phase 2, Prisma-backed).
 *
 * Only SHA-256 hashes of tokens are stored — never the raw token. A token
 * is single-use (usedAt) and expires after 60 minutes. Requesting a new
 * reset invalidates earlier unused tokens for the same user. Resetting
 * revokes every session (handled by the password-reset service).
 *
 * Email delivery is NOT configured yet (Resend + domain pending — see
 * RUNBOOK.md), so a requested token cannot reach the user today. The
 * token machinery is complete and tested; the email step is the gap.
 */
import { getDb } from './client';
import type { PasswordResetRecord } from './types';

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 60 minutes

export async function createPasswordReset(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<PasswordResetRecord> {
  const row = await getDb().orm.public.PasswordReset.create({
    userId,
    tokenHash,
    expiresAt,
  });
  return row;
}

export async function findPasswordResetByTokenHash(
  tokenHash: string,
): Promise<PasswordResetRecord | null> {
  const row = await getDb().orm.public.PasswordReset.where({ tokenHash }).first();
  return row ?? null;
}

export async function markPasswordResetUsed(id: string): Promise<boolean> {
  const row = await getDb()
    .orm.public.PasswordReset.where({ id })
    .where((p) => p.usedAt.isNull())
    .update({ usedAt: new Date() });
  return row !== null;
}

/** Delete all unused reset tokens for a user (new request, or after a successful reset). Returns how many were removed. */
export async function revokePasswordResetsForUser(userId: string): Promise<number> {
  const rows = await getDb()
    .orm.public.PasswordReset.where({ userId })
    .where((p) => p.usedAt.isNull())
    .select('id')
    .all();
  if (rows.length === 0) return 0;
  await getDb()
    .orm.public.PasswordReset.where({ userId })
    .where((p) => p.usedAt.isNull())
    .deleteAll();
  return rows.length;
}
