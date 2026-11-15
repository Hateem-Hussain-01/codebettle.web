import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireRoles } from '@/lib/api-helpers';
import { updateOwnAmbassadorGroup } from '@/lib/db/ambassadors';

/**
 * PATCH /api/student/ambassador — an ambassador updates their OWN
 * campus-group link + daily member count.
 *
 * Own-record enforcement is server-side: the ambassador is resolved
 * from the session user id (updateOwnAmbassadorGroup), so a caller
 * can never edit another ambassador's record — there is no
 * ambassador id in the request at all. Non-ambassadors get 404
 * (same as the dashboard's "not an ambassador" state).
 *
 * Body: { groupLink?: string, groupMemberCount?: number }. An empty
 * groupLink clears the link; an omitted groupMemberCount leaves the
 * count (and its last-updated date) unchanged. Setting the count
 * stamps groupCountUpdatedAt to now.
 */
const patchSchema = z.object({
  groupLink: z.string().max(500).optional(),
  groupMemberCount: z.number().int().min(0).max(1000000).optional(),
});

export async function PATCH(request: NextRequest) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return invalidBody('groupLink and groupMemberCount are invalid');
  const groupLink = parsed.data.groupLink?.trim() ?? undefined;
  if (groupLink !== undefined && groupLink !== '' && !/^https?:\/\/\S+$/.test(groupLink)) {
    return NextResponse.json({ error: 'Group link must be a valid http(s) URL' }, { status: 400 });
  }
  const updated = await updateOwnAmbassadorGroup(auth.session.id, {
    groupLink,
    groupMemberCount: parsed.data.groupMemberCount,
  });
  if (!updated) {
    return NextResponse.json({ error: 'You are not an ambassador' }, { status: 404 });
  }
  return NextResponse.json({ ambassador: updated });
}
