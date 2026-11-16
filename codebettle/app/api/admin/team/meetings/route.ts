import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminArea } from '@/lib/api-helpers';
import {
  createTeamMeeting,
  isMissingTeamTableError,
  listTeamMeetings,
  TEAM_TABLE_MISSING_MESSAGE,
} from '@/lib/db/team';

const createSchema = z.object({
  title: z.string().min(1),
  startsAt: z.string().min(1),
  meetingLink: z.string().optional(),
  agenda: z.string().optional(),
});

function teamTableError(e: unknown): NextResponse | null {
  if (isMissingTeamTableError(e)) {
    return NextResponse.json({ error: TEAM_TABLE_MISSING_MESSAGE }, { status: 503 });
  }
  return null;
}

/**
 * GET /api/admin/team/meetings — all team meetings (admin `team`
 * area). POST — schedule one (title + start date/time, optional
 * meeting link + agenda).
 */
export async function GET() {
  const auth = await requireAdminArea('team');
  if ('error' in auth) return auth.error;
  try {
    return NextResponse.json({ meetings: await listTeamMeetings() });
  } catch (e) {
    return teamTableError(e) ?? NextResponse.json({ error: 'Could not load team meetings' }, { status: 500 });
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
    return NextResponse.json({ error: 'Title and a valid start date and time are required' }, { status: 400 });
  }
  try {
    const meeting = await createTeamMeeting({ ...parsed.data, createdBy: auth.session.id });
    return NextResponse.json({ meeting }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && /required/i.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return teamTableError(e) ?? NextResponse.json({ error: 'Could not schedule the meeting' }, { status: 500 });
  }
}
