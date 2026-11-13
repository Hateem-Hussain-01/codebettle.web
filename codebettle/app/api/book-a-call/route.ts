import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, bookACallRateLimitKey } from '@/lib/rate-limit';
import { createBookACall, BOOK_A_CALL_TABLE_MISSING_MESSAGE } from '@/lib/db/book-a-call';
import { sendBookACallEmail } from '@/lib/email/resend';

/**
 * POST /api/book-a-call — free career-guidance call request (PR #33).
 *
 * Public: no auth, rate-limited (5 per 15 minutes per IP). Asks
 * student questions only — no budget question, the call is free.
 * The booking is saved FIRST; the email to the 3 recipients (Ahmad
 * Hassan, Zohad Ijaz, Eman) is best-effort and never blocks the save:
 * when Resend is not configured the booking is still saved and listed
 * in admin, and the response says the email was not sent. Until the
 * BookACall table exists (Eman runs
 * codebettle-footer-bookcall-migration.sql), returns 503.
 */
const bookACallSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required').max(100),
  email: z.string().trim().email('A valid email address is required').max(200),
  phone: z.string().trim().max(30).optional(),
  currentStatus: z.enum(['student', 'professional'], {
    message: 'Please tell us whether you are a student or a professional',
  }),
  courseInterest: z.string().trim().max(200).optional(),
  guidanceNeeded: z.string().trim().min(1, 'Please tell us what guidance you need').max(2000),
  preferredContact: z.string().trim().max(200).optional(),
});

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(bookACallRateLimitKey(clientIp(request)), 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const parsed = bookACallSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  }
  try {
    const booking = await createBookACall({
      fullName: parsed.data.fullName,
      email: parsed.data.email,
      phone: parsed.data.phone || undefined,
      currentStatus: parsed.data.currentStatus,
      courseInterest: parsed.data.courseInterest || undefined,
      guidanceNeeded: parsed.data.guidanceNeeded,
      preferredContact: parsed.data.preferredContact || undefined,
    });
    // Best-effort: the booking is saved no matter what the email does.
    const results = await sendBookACallEmail(booking, { baseUrl: request.nextUrl.origin });
    const emailSent = results.some((r) => r.sent);
    return NextResponse.json({ ok: true, booking, emailSent }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === BOOK_A_CALL_TABLE_MISSING_MESSAGE) {
      return NextResponse.json(
        { error: 'Book a Call is not set up yet. Please try again later.' },
        { status: 503 },
      );
    }
    console.error('[book-a-call] Failed to save booking:', error);
    return NextResponse.json({ error: 'Could not save your request. Please try again later.' }, { status: 500 });
  }
}
