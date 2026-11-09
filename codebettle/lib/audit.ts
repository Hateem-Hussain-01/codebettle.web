/**
 * Append-only audit log (Phase 1: in-memory; Phase 2: Prisma `audit_logs` table).
 * Every privileged action writes an entry here: user management, role
 * changes, suspension, session revocation, certificate actions.
 * Entries are never edited or deleted in place.
 */

export interface AuditEntry {
  id: string;
  actorId: string | null; // null = system / unauthenticated
  action: string;
  entity: string;
  entityId?: string;
  detail?: string;
  createdAt: string;
}

const entries: AuditEntry[] = [];
let counter = 0;

export function logAudit(entry: Omit<AuditEntry, 'id' | 'createdAt'>): AuditEntry {
  counter += 1;
  const full: AuditEntry = {
    ...entry,
    id: `audit-${Date.now()}-${counter}`,
    createdAt: new Date().toISOString(),
  };
  entries.push(full);
  return full;
}

/** Newest-first copy of the log. */
export function getAuditLog(): AuditEntry[] {
  return [...entries].reverse();
}

/** Test helper: clear the log. Never call in production code. */
export function __clearAuditLog(): void {
  entries.length = 0;
}
