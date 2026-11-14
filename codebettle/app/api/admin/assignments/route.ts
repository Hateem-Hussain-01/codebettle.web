import { NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { areAssignmentTablesReady, enrichAssignments, listAllAssignments } from '@/lib/db/assignments';

/**
 * GET /api/admin/assignments — every assignment (admin view),
 * enriched with course title, batch label, creator name and
 * submission/graded counts. Includes `tablesReady` so the admin UI
 * can show a "run the SQL" state when the migration has not run yet.
 * Guard: requireAdminArea('assignments').
 */
export async function GET() {
  const auth = await requireAdminArea('assignments');
  if ('error' in auth) return auth.error;
  const [tablesReady, all] = await Promise.all([areAssignmentTablesReady(), listAllAssignments()]);
  const assignments = await enrichAssignments(all);
  return NextResponse.json({ assignments, tablesReady });
}
