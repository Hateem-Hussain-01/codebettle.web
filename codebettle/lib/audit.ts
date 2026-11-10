/**
 * Append-only audit log — thin compatibility wrapper (Phase 2).
 * Entries now live in the Prisma `AuditLog` table (lib/db/audit.ts).
 * Every privileged action writes an entry; entries are never edited or
 * deleted in place.
 */
export { getAuditLog, logAudit } from './db/audit';
export type { LogAuditInput } from './db/audit';
export type { AuditEntry } from './db/types';
