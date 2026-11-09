/**
 * Login events (Phase 2, Prisma-backed).
 *
 * One row per login attempt (success or failure) — the login history the
 * plan requires for suspicious-activity monitoring. Written by the auth
 * route, which has the client IP and user agent. Never contains a
 * password or a token.
 */
import { getDb } from './client';
import type { LoginEvent } from './types';

export interface RecordLoginEventInput {
  email: string;
  userId?: string;
  success: boolean;
  ip?: string;
  userAgent?: string;
}

export async function recordLoginEvent(input: RecordLoginEventInput): Promise<void> {
  await getDb().orm.public.LoginEvent.create({
    email: input.email,
    userId: input.userId ?? null,
    success: input.success,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

/** Recent login events for one email (newest first). Admin/monitoring use. */
export async function listLoginEvents(email: string, limit = 50): Promise<LoginEvent[]> {
  const rows = await getDb()
    .orm.public.LoginEvent.where((e) => e.email.eq(email))
    .orderBy((e) => e.createdAt.desc())
    .limit(limit)
    .all();
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId ?? undefined,
    email: r.email,
    success: r.success,
    ip: r.ip ?? undefined,
    userAgent: r.userAgent ?? undefined,
    createdAt: r.createdAt.toISOString(),
  }));
}
