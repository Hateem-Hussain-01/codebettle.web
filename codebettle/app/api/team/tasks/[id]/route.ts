import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTeamMember } from '@/lib/api-helpers';
import { hasAdminCapability } from '@/lib/rbac';
import { moveTeamTaskStatus, TEAM_TABLE_MISSING_MESSAGE, isMissingTeamTableError } from '@/lib/db/team';

const moveSchema = z.object({
  status: z.enum(['todo', 'doing', 'done']),
});

/**
 * PATCH /api/team/tasks/[id] — move a task one step forward.
 * Team members only (assignee only, todo -> doing -> done); admins may
 * set any status. The server re-checks both — a forged request gets a
 * 403, not a silent update.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTeamMember();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = moveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Valid status required (todo, doing or done)' }, { status: 400 });
  }
  try {
    const updated = await moveTeamTaskStatus(id, parsed.data.status, {
      id: auth.session.id,
      email: auth.session.email,
      isAdmin: hasAdminCapability(auth.session),
    });
    if (!updated) {
      return NextResponse.json(
        { error: 'Task not found, not assigned to you, or the move is not allowed' },
        { status: 403 },
      );
    }
    return NextResponse.json({ task: updated });
  } catch (e) {
    if (isMissingTeamTableError(e)) {
      return NextResponse.json({ error: TEAM_TABLE_MISSING_MESSAGE }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not update the task' }, { status: 500 });
  }
}
