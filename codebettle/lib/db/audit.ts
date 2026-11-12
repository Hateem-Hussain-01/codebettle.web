/**
 * Append-only audit log (Phase 2, Prisma-backed).
 *
 * Same function names as the Phase 1 in-memory log, now persisted in the
 * Prisma `AuditLog` table. Every privileged action writes an entry:
 * user management, role changes, suspension, session revocation,
 * certificate actions. Entries are never edited or deleted in place.
 */
import { getDb } from './client';
import type { AuditEntry, AuditLogRow } from './types';

export interface LogAuditInput {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string;
  detail?: string;
  ip?: string;
}

function toAuditEntry(row: AuditLogRow): AuditEntry {
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

export async function logAudit(entry: LogAuditInput): Promise<AuditEntry> {
  const row = await getDb().orm.public.AuditLog.create({
    actorId: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    detail: entry.detail ?? null,
    ip: entry.ip ?? null,
  });
  return toAuditEntry(row);
}

/** Newest-first audit entries (default 100). */
export async function getAuditLog(limit = 100): Promise<AuditEntry[]> {
  const rows = await getDb()
    .orm.public.AuditLog.orderBy((a) => a.createdAt.desc())
    .limit(limit)
    .all();
  return rows.map(toAuditEntry);
}

export interface AuditLogFilters {
  actorId?: string;
  action?: string;
  entity?: string;
  /** ISO date string (inclusive lower bound on createdAt). */
  from?: string;
  /** ISO date string (inclusive upper bound on createdAt). */
  to?: string;
  /** Page size, clamped to 1–100 (default 100). */
  limit?: number;
  /** Rows to skip (default 0). */
  offset?: number;
}

/**
 * Phase 5 (Module 23): filtered audit log for the /admin/audit page.
 * Newest-first. `total` counts every row matching the filters, ignoring
 * limit/offset (the same `.all().length` total pattern as
 * listNotificationsForUser / listSupportRequests). Unparseable `from` /
 * `to` values are ignored rather than failing the query.
 */
export async function getAuditLogFiltered(
  filters: AuditLogFilters = {},
): Promise<{ entries: AuditEntry[]; total: number }> {
  let query = getDb().orm.public.AuditLog;
  if (filters.actorId) query = query.where({ actorId: filters.actorId });
  if (filters.action) query = query.where({ action: filters.action });
  if (filters.entity) query = query.where({ entity: filters.entity });
  const from = filters.from ? new Date(filters.from) : null;
  if (from && !Number.isNaN(from.getTime())) {
    query = query.where((a) => a.createdAt.gte(from));
  }
  const to = filters.to ? new Date(filters.to) : null;
  if (to && !Number.isNaN(to.getTime())) {
    query = query.where((a) => a.createdAt.lte(to));
  }
  const total = (await query.all()).length;
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  const rows = await query
    .orderBy((a) => a.createdAt.desc())
    .limit(limit)
    .offset(offset)
    .all();
  return { entries: rows.map(toAuditEntry), total };
}
