import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminArea } from '@/lib/api-helpers';
import {
  createTeamAnnouncement,
  isMissingTeamTableError,
  listTeamAnnouncements,
  TEAM_TABLE_MISSING_MESSAGE,
} from '@/lib/db/team';

const createSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

function teamTableError(e: unknown): NextResponse | null {
  if (isMissingTeamTableError(e)) {
    return NextResponse.json({ error: TEAM_TABLE_MISSING_MESSAGE }, { status: 503 });
  }
  return null;
}

/**
 * GET /api/admin/team/announcements — all team announcements
 * (admin `team` area). POST — post one (title + body).
 */
export async function GET() {
  const auth = await requireAdminArea('team');
  if ('error' in auth) return auth.error;
  try {
    return NextResponse.json({ announcements: await listTeamAnnouncements() });
  } catch (e) {
    return teamTableError(e) ?? NextResponse.json({ error: 'Could not load team announcements' }, { status: 500 });
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
    return NextResponse.json({ error: 'Title and body are required' }, { status: 400 });
  }
  try {
    const announcement = await createTeamAnnouncement({ ...parsed.data, createdBy: auth.session.id });
    return NextResponse.json({ announcement }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && /required/i.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return teamTableError(e) ?? NextResponse.json({ error: 'Could not post the announcement' }, { status: 500 });
  }
}
