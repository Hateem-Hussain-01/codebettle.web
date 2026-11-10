import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyEmail } from '@/lib/services/email-verification-service';

/**
 * POST /api/auth/verify-email — consume a signup verification token.
 *
 * Body: { token }. On success the account's email is marked verified
 * (User.emailVerifiedAt). The token is single-use and expires after
 * 24 hours; used, expired, or unknown tokens get the same generic
 * error. This is a SEPARATE namespace from /verify/[token], which is
 * the public certificate verification page — the two must never share
 * tokens. Login is NOT blocked for unverified users.
 */

const verifySchema = z.object({
  token: z.string().min(1),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }
  const result = await verifyEmail(parsed.data.token);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
