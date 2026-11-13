import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, subscribeRateLimitKey } from '@/lib/rate-limit';
import { createSubscriber, SUBSCRIBER_TABLE_MISSING_MESSAGE } from '@/lib/db/subscribers';

/**
 * POST /api/subscribe — footer newsletter subscribe (PR #33).
 *
 * Public: no auth, rate-limited (5 per 15 minutes per IP). Subscribing
 * twice is idempotent — the same email returns the existing row and
 * 200, never an error. Until the Subscriber table exists (Eman runs
 * codebettle-footer-bookcall-migration.sql), returns 503.
 */
const subscribeSchema = z.object({
  email: z.string().trim().email('A valid email address is required').max(200),
});

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(subscribeRateLimitKey(clientIp(request)), 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many subscription attempts. Please try again later.' },
      { status: 429 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid email' }, { status: 400 });
  }
  try {
    const subscriber = await createSubscriber(parsed.data.email);
    return NextResponse.json({ ok: true, subscriber }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === SUBSCRIBER_TABLE_MISSING_MESSAGE) {
      return NextResponse.json(
        { error: 'Subscriptions are not set up yet. Please try again later.' },
        { status: 503 },
      );
    }
    console.error('[subscribe] Failed to save subscriber:', error);
    return NextResponse.json({ error: 'Could not subscribe. Please try again later.' }, { status: 500 });
  }
}
