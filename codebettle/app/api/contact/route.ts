import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, contactRateLimitKey } from '@/lib/rate-limit';
import { createContactMessage } from '@/lib/db/contact-messages';

/**
 * POST /api/contact — submit the public contact form (Phase 7).
 * Before Phase 7 the form faked the send (timeout + toast, nothing
 * stored). Messages are now persisted to ContactMessage and listed in
 * the admin inbox (/admin/messages). Public: no auth, but rate-limited
 * (5 submissions per 15 minutes per IP) so the form cannot be used to
 * flood the inbox. Email delivery to the admins is not wired — there
 * is no Resend yet — the inbox is the delivery channel for now.
 */
const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().email('A valid email address is required').max(200),
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().min(1, 'Message is required').max(5000),
});

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(contactRateLimitKey(clientIp(request)), 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many messages. Please try again later.' },
      { status: 429 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid message' }, { status: 400 });
  }
  const saved = await createContactMessage({
    name: parsed.data.name,
    email: parsed.data.email,
    subject: parsed.data.subject || undefined,
    message: parsed.data.message,
  });
  return NextResponse.json({ message: saved }, { status: 201 });
}
