import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, resetRateLimitKey } from '@/lib/rate-limit';
import { requestPasswordReset, resetPassword } from '@/lib/services/password-reset-service';

/**
 * POST /api/auth/reset — password reset (Phase 2).
 *
 * action 'request': ask for a reset link. The response is ALWAYS the
 * same generic success, whether or not the email has an account (no
 * enumeration oracle).
 * action 'reset': consume a reset token and set a new password. Tokens
 * are single-use and expire after 60 minutes; a successful reset
 * revokes every session.
 *
 * KNOWN GAP — email delivery is NOT configured yet (Resend + Eman's
 * domain are pending; see RUNBOOK.md). The 'request' action therefore
 * creates a token but cannot send it to the user, so the reset cannot
 * complete from the UI today. The token is never returned in a response.
 * The machinery (token hashing, expiry, single-use, session revocation)
 * is complete and unit-tested; only the delivery step is missing.
 */

const requestSchema = z.object({
  action: z.literal('request'),
  email: z.string().min(1),
});

const resetSchema = z.object({
  action: z.literal('reset'),
  token: z.string().min(1),
  newPassword: z.string().min(1),
  confirmPassword: z.string().optional(),
});

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const action = (body as { action?: unknown })?.action;

  if (action === 'request') {
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    // Rate-limited like login (Phase 7, SEC-05): without this, anyone
    // could request resets endlessly for any email — minting tokens
    // forever and, once Resend is wired, mail-bombing the victim.
    // The 429 still returns the generic message shape (no oracle).
    const limit = checkRateLimit(
      resetRateLimitKey(clientIp(request), parsed.data.email),
      5,
      15 * 60 * 1000,
    );
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many reset requests. Please try again later.' },
        { status: 429 },
      );
    }
    // No deliver callback yet — email is not configured (see header).
    // The token is created and stored (hashed); it expires in 60 min.
    await requestPasswordReset(parsed.data.email);
    return NextResponse.json({
      success: true,
      message: 'If an account exists for this email, a reset link has been sent.',
    });
  }

  if (action === 'reset') {
    const parsed = resetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Token and new password are required' }, { status: 400 });
    }
    const { token, newPassword, confirmPassword } = parsed.data;
    if (confirmPassword !== undefined && confirmPassword !== newPassword) {
      return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
    }
    const result = await resetPassword(token, newPassword);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
