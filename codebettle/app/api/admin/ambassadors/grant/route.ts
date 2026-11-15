import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import { createAmbassador } from '@/lib/db/ambassadors';

/**
 * POST /api/admin/ambassadors/grant — grant ambassador status
 * directly by email (admin only).
 *
 * Eman gives referral codes to his own people (including himself)
 * without them going through the /become-ambassador form. Creates
 * the ambassador + random referral code for the email, linking the
 * user account now when one exists with that email. Idempotent:
 * granting an already-ambassador email returns the existing record.
 */
const postSchema = z.object({
  email: z.string().min(1).email(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('ambassadors');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return invalidBody('a valid email is required');
  try {
    const ambassador = await createAmbassador({ email: parsed.data.email });
    return NextResponse.json({ ambassador }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message.includes('not set up yet')) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    throw e;
  }
}
