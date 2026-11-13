import { NextRequest, NextResponse } from 'next/server';
import { getRequestSession, invalidBody, readJson } from '@/lib/api-helpers';
import { checkRateLimit, successStorySubmitRateLimitKey } from '@/lib/rate-limit';
import { areSuccessStoryTablesReady } from '@/lib/db/success-stories';
import { listPublicSuccessStories, submitSuccessStory } from '@/lib/services/success-story-service';

/**
 * GET /api/success-stories — approved stories only, public fields only.
 * Never exposes email, idempotency keys, admin notes or private evidence
 * file paths. Includes `tablesReady` so the public page can tell "no
 * approved stories yet" apart from "the migration SQL has not run".
 *
 * POST /api/success-stories — submit a story (guest or logged in).
 * Body is JSON (files are uploaded first through signed URLs and
 * referenced by storage path — see /api/success-stories/upload-url).
 * Rate-limited: 5 submissions per 15 minutes per IP. Returns
 * { ok: true, submissionNumber, submissionId, submittedAt, status }
 * or 400/409/429/503 with { error }.
 */
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

export async function GET() {
  const [stories, tablesReady] = await Promise.all([
    listPublicSuccessStories(),
    areSuccessStoryTablesReady(),
  ]);
  return NextResponse.json({ stories, tablesReady });
}

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(successStorySubmitRateLimitKey(clientIp(request)), 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many submissions. Please try again later.' },
      { status: 429 },
    );
  }
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const session = await getRequestSession();
  const result = await submitSuccessStory(body as never, session?.id ?? null);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(
    {
      ok: true,
      submissionNumber: result.submission.submissionNumber,
      submissionId: result.submission.id,
      submittedAt: result.submission.submittedAt,
      status: result.submission.status,
      duplicate: result.duplicate,
    },
    { status: result.duplicate ? 200 : 201 },
  );
}
