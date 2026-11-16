import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminArea } from '@/lib/api-helpers';
import {
  createTeamTask,
  isMissingTeamTableError,
  listTeamTasks,
  TEAM_TABLE_MISSING_MESSAGE,
  updateTeamTask,
} from '@/lib/db/team';

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeEmail: z.string().email(),
  dueDate: z.string().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  assigneeEmail: z.string().email().optional(),
  dueDate: z.string().nullable().optional(),
  status: z.enum(['todo', 'doing', 'done']).optional(),
});

function teamTableError(e: unknown): NextResponse | null {
  if (isMissingTeamTableError(e)) {
    return NextResponse.json({ error: TEAM_TABLE_MISSING_MESSAGE }, { status: 503 });
  }
  return null;
}

/**
 * GET /api/admin/team/tasks — all team tasks (admin `team` area).
 * POST — create a task (title, assignee email, optional description /
 * due date). PATCH — admin edit (title / description / assignee /
 * due date / status).
 */
export async function GET() {
  const auth = await requireAdminArea('team');
  if ('error' in auth) return auth.error;
  try {
    return NextResponse.json({ tasks: await listTeamTasks() });
  } catch (e) {
    return teamTableError(e) ?? NextResponse.json({ error: 'Could not load team tasks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('team');
  if ('error' in auth) return auth.error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Title and a valid assignee email are required' }, { status: 400 });
  }
  try {
    const task = await createTeamTask({ ...parsed.data, createdBy: auth.session.id });
    return NextResponse.json({ task }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && /required/i.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return teamTableError(e) ?? NextResponse.json({ error: 'Could not create the task' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminArea('team');
  if ('error' in auth) return auth.error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Valid task id and fields are required' }, { status: 400 });
  }
  try {
    const { id, ...patch } = parsed.data;
    const task = await updateTeamTask(id, patch);
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    return NextResponse.json({ task });
  } catch (e) {
    if (e instanceof Error && /required/i.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return teamTableError(e) ?? NextResponse.json({ error: 'Could not update the task' }, { status: 500 });
  }
}
