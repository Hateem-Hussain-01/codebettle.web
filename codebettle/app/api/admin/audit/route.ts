import { NextRequest, NextResponse } from 'next/server';
import { requireAuditLogAccess } from '@/lib/api-helpers';
import { getAuditLogFiltered } from '@/lib/db/audit';
import { getUsersByIds } from '@/lib/db/users';

/**
 * GET /api/admin/audit — filtered audit log (Phase 5, Module 23).
 *
 * Gate: requireAuditLogAccess — official administrators, or admins
 * explicitly granted audit viewing (canViewAuditLog). A signed-in user
 * denied here gets a denial AuditLog entry first (see the guard).
 *
 * Query params: actor (user id), action, entity, from (ISO date),
 * to (ISO date), page (default 1), pageSize (default 50, max 100).
 * Bad page/pageSize or unparseable dates are 400.
 *
 * Response: { entries, total, page, pageSize } where each entry is
 * { id, actorId, actorName, actorEmail, action, entity, entityId,
 *   detail, ip, createdAt }. Actor names/emails are resolved with one
 * batched lookup; unknown or system (null) actors get null names.
 */
function parsePositiveInt(raw: string | null, fallback: number): number | null {
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return n;
}

function nonEmpty(raw: string | null): string | undefined {
  if (raw === null) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuditLogAccess();
  if ('error' in auth) return auth.error;

  const params = request.nextUrl.searchParams;
  const page = parsePositiveInt(params.get('page'), 1);
  const pageSize = parsePositiveInt(params.get('pageSize'), 50);
  if (page === null || pageSize === null || pageSize > 100) {
    return NextResponse.json(
      { error: 'page must be a positive integer and pageSize must be between 1 and 100' },
      { status: 400 },
    );
  }
  const from = nonEmpty(params.get('from'));
  const to = nonEmpty(params.get('to'));
  if (
    (from !== undefined && Number.isNaN(Date.parse(from))) ||
    (to !== undefined && Number.isNaN(Date.parse(to)))
  ) {
    return NextResponse.json(
      { error: 'from and to must be valid ISO dates' },
      { status: 400 },
    );
  }

  const { entries, total } = await getAuditLogFiltered({
    actorId: nonEmpty(params.get('actor')),
    action: nonEmpty(params.get('action')),
    entity: nonEmpty(params.get('entity')),
    from,
    to,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const actorIds = [
    ...new Set(
      entries.map((e) => e.actorId).filter((id): id is string => id !== null),
    ),
  ];
  const actors = await getUsersByIds(actorIds);

  return NextResponse.json({
    entries: entries.map((entry) => {
      const actor = entry.actorId ? actors.get(entry.actorId) : undefined;
      return {
        id: entry.id,
        actorId: entry.actorId,
        actorName: actor?.name ?? null,
        actorEmail: actor?.email ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        detail: entry.detail ?? null,
        ip: entry.ip ?? null,
        createdAt: entry.createdAt,
      };
    }),
    total,
    page,
    pageSize,
  });
}
