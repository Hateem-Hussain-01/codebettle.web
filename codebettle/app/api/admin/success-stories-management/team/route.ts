import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import {
  areTeamMemberTablesReady,
  createTeamMember,
  listTeamMembers,
} from '@/lib/db/team-members';
import { validateTeamMember } from '@/lib/management';

/**
 * GET /api/admin/success-stories-management/team — list all team members.
 * POST — add one. Guard: requireAdminArea('success-stories-management').
 * Includes `tablesReady` so the admin UI can show a "run the SQL" state
 * when the migration has not run yet.
 */
export async function GET() {
  const auth = await requireAdminArea('success-stories-management');
  if ('error' in auth) return auth.error;
  const [members, tablesReady] = await Promise.all([listTeamMembers(), areTeamMemberTablesReady()]);
  return NextResponse.json({ members, tablesReady });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('success-stories-management');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const v = body as Record<string, unknown>;
  const input = {
    fullName: typeof v.fullName === 'string' ? v.fullName : '',
    designation: typeof v.designation === 'string' ? v.designation : '',
    bio: typeof v.bio === 'string' ? v.bio : null,
    photoUrl: typeof v.photoUrl === 'string' ? v.photoUrl : null,
    xUrl: typeof v.xUrl === 'string' ? v.xUrl : null,
    linkedinUrl: typeof v.linkedinUrl === 'string' ? v.linkedinUrl : null,
    githubUrl: typeof v.githubUrl === 'string' ? v.githubUrl : null,
    websiteUrl: typeof v.websiteUrl === 'string' ? v.websiteUrl : null,
    level: typeof v.level === 'number' ? v.level : 1,
    orderInLevel: typeof v.orderInLevel === 'number' ? v.orderInLevel : 0,
    enabled: typeof v.enabled === 'boolean' ? v.enabled : true,
  };
  const error = validateTeamMember(input);
  if (error) return NextResponse.json({ error }, { status: 400 });
  try {
    const member = await createTeamMember(input);
    return NextResponse.json({ member }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not add the team member';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not add the team member' }, { status: 500 });
  }
}
