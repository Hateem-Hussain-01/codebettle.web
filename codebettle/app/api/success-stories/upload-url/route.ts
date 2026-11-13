import { NextRequest, NextResponse } from 'next/server';
import { getRequestSession, invalidBody, readJson } from '@/lib/api-helpers';
import { checkRateLimit, successStoryUploadRateLimitKey } from '@/lib/rate-limit';
import { createSuccessStorySignedUpload } from '@/lib/services/success-story-storage';

/**
 * POST /api/success-stories/upload-url — mint a signed upload URL.
 *
 * The browser uploads the file DIRECTLY to Supabase Storage (PUT to
 * the returned signedUrl) — files never travel through the API route,
 * which is what makes the 100 MB video limit honest (Vercel serverless
 * functions cap request payloads at ~4.5 MB).
 *
 * Body: { kind: 'profile' | 'evidence' | 'video', mime: string, size: number }
 * Returns { signedUrl, path, bucket, expiresInSeconds }.
 * Rate-limited: 20 per 15 minutes per IP. The submit endpoint
 * re-validates every referenced file server-side (existence + MIME +
 * size), so a minted URL alone never gets a file into a submission.
 */
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(successStoryUploadRateLimitKey(clientIp(request)), 20, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many upload requests. Please try again later.' },
      { status: 429 },
    );
  }
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const v = body as Record<string, unknown>;
  if (v.kind !== 'profile' && v.kind !== 'evidence' && v.kind !== 'video') {
    return NextResponse.json({ error: 'Upload kind is not valid' }, { status: 400 });
  }
  if (typeof v.mime !== 'string' || typeof v.size !== 'number') {
    return NextResponse.json({ error: 'File type and size are required' }, { status: 400 });
  }
  // The session is read (and recorded in the audit trail of the
  // submission itself) but uploads are open to guests — the form
  // accepts guest submissions.
  await getRequestSession();
  try {
    const signed = await createSuccessStorySignedUpload(v.kind, v.mime, v.size);
    return NextResponse.json(signed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not prepare the upload';
    if (/SUPABASE_SERVICE_ROLE_KEY is not set|Supabase URL is not set/.test(message)) {
      return NextResponse.json({ error: 'File uploads are not configured yet' }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
