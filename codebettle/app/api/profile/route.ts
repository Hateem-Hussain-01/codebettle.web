import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserById, updateUser } from '@/lib/db/users';
import { assertNotViewAs, invalidBody, readJson, requireSession } from '@/lib/api-helpers';

/**
 * GET /api/profile — the signed-in user's own profile (safe fields only,
 * never the password hash). PATCH /api/profile — update the signed-in
 * user's name, bio, phone, expertise tags and social links.
 *
 * Email is identity, not editable here: it is the login credential, so
 * it stays read-only in the profile UI and is rejected here if sent.
 * Role, status and email changes stay admin-only (see admin-service).
 */

const socialLinksSchema = z.object({
  website: z.string().max(500).optional(),
  github: z.string().max(500).optional(),
  linkedin: z.string().max(500).optional(),
  twitter: z.string().max(500).optional(),
});

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    bio: z.string().max(1000).nullable().optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    expertise: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    socialLinks: socialLinksSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export async function GET() {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const user = await getUserById(auth.session.id);
  if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  return NextResponse.json({ user });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return invalidBody('Name, bio, phone, expertise or social links are invalid');
  }
  const updated = await updateUser(auth.session.id, {
    name: parsed.data.name,
    bio: parsed.data.bio,
    phone: parsed.data.phone,
    expertise: parsed.data.expertise,
    socialLinks: parsed.data.socialLinks,
  });
  if (!updated) return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  return NextResponse.json({ user: updated });
}
