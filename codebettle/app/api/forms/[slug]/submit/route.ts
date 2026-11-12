import { NextRequest, NextResponse } from 'next/server';
import { getRequestSession, invalidBody, readJson } from '@/lib/api-helpers';
import { checkRateLimit, formSubmitRateLimitKey } from '@/lib/rate-limit';
import { submitFormService } from '@/lib/services/form-service';

/**
 * POST /api/forms/[slug]/submit — submit a published form (Phase 6).
 * Public: no auth required (anonymous submissions store
 * submitterId null; a signed-in user's id is recorded instead).
 * Body: { data: { [fieldId]: value } }. The payload is validated
 * against the STORED schema — a client-sent schema is never trusted —
 * and extra/tampered fields are rejected with per-field errors.
 * Rate-limited: 5 submissions per 15 minutes per IP.
 * Returns { ok: true, submissionId } or 400 with fieldErrors.
 */
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const limit = checkRateLimit(formSubmitRateLimitKey(clientIp(request)), 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many submissions. Please try again later.' },
      { status: 429 },
    );
  }
  const { slug } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const data =
    body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).data
      : undefined;
  const session = await getRequestSession();
  const result = await submitFormService(slug, data, session?.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, fieldErrors: result.fieldErrors },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true, submissionId: result.submissionId }, { status: 201 });
}
