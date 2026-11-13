import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, requireFullAdmin } from '@/lib/api-helpers';
import { deleteTeamMember, getTeamMemberById, updateTeamMember } from '@/lib/db/team-members';
import { validateTeamMember } from '@/lib/management';

/**
 * PATCH /api/admin/success-stories-management/team/[id] — edit a team
 * member (any subset of fields, including the enabled toggle and the
 * order/level for reordering). Guard: requireAdminArea.
 *
 * DELETE — remove a team member. Guard: requireFullAdmin (destructive,
 * same rule as deleting a success story submission).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('success-stories-management');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const current = await getTeamMemberById(id);
  if (!current) return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
  const v = body as Record<string, unknown>;
  const merged = {
    fullName: typeof v.fullName === 'string' ? v.fullName : current.fullName,
    designation: typeof v.designation === 'string' ? v.designation : current.designation,
    bio: typeof v.bio === 'string' ? v.bio : v.bio === null ? null : current.bio ?? null,
    photoUrl: typeof v.photoUrl === 'string' ? v.photoUrl : v.photoUrl === null ? null : current.photoUrl ?? null,
    xUrl: typeof v.xUrl === 'string' ? v.xUrl : v.xUrl === null ? null : current.xUrl ?? null,
    linkedinUrl: typeof v.linkedinUrl === 'string' ? v.linkedinUrl : v.linkedinUrl === null ? null : current.linkedinUrl ?? null,
    githubUrl: typeof v.githubUrl === 'string' ? v.githubUrl : v.githubUrl === null ? null : current.githubUrl ?? null,
    websiteUrl: typeof v.websiteUrl === 'string' ? v.websiteUrl : v.websiteUrl === null ? null : current.websiteUrl ?? null,
    level: typeof v.level === 'number' ? v.level : current.level,
    orderInLevel: typeof v.orderInLevel === 'number' ? v.orderInLevel : current.orderInLevel,
  };
  const error = validateTeamMember(merged);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const patch: Record<string, unknown> = { ...merged };
  if (typeof v.enabled === 'boolean') patch.enabled = v.enabled;
  try {
    const member = await updateTeamMember(id, patch);
    if (!member) return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    return NextResponse.json({ member });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not update the team member';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not update the team member' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireFullAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  try {
    const deleted = await deleteTeamMember(id);
    if (!deleted) return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not delete the team member';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not delete the team member' }, { status: 500 });
  }
}
