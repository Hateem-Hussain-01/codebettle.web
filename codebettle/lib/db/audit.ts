/**
 * Append-only audit log (Phase 2, Prisma-backed).
 *
 * Same function names as the Phase 1 in-memory log, now persisted in the
 * Prisma `AuditLog` table. Every privileged action writes an entry:
 * user management, role changes, suspension, session revocation,
 * certificate actions. Entries are never edited or deleted in place.
 */
import { getDb } from './client';
import type { AuditEntry } from './types';

export interface LogAuditInput {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string;
  detail?: string;
  ip?: string;
}

export async function logAudit(entry: LogAuditInput): Promise<AuditEntry> {
  const row = await getDb().orm.public.AuditLog.create({
    actorId: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    detail: entry.detail ?? null,
    ip: entry.ip ?? null,
  });
  return {
    id: row.id,
    actorId: row.actorId,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId ?? undefined,
    detail: row.detail ?? undefined,
    ip: row.ip ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Newest-first audit entries (default 100). */
export async function getAuditLog(limit = 100): Promise<AuditEntry[]> {
  const rows = await getDb()
    .orm.public.AuditLog.orderBy((a) => a.createdAt.desc())
    .limit(limit)
    .all();
  return rows.map((r) => ({
    id: r.id,
    actorId: r.actorId,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId ?? undefined,
    detail: r.detail ?? undefined,
    ip: r.ip ?? undefined,
    createdAt: r.createdAt.toISOString(),
  }));
}
