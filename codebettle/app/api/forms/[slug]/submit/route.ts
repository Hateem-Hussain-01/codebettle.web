import { NextRequest, NextResponse } from 'next/server';
import { getRequestSession, invalidBody, readJson } from '@/lib/api-helpers';
import { checkRateLimit, formSubmitRateLimitKey } from '@/lib/rate-limit';
import {
  submitFormMultipartService,
  submitFormService,
  type MultipartFileInput,
} from '@/lib/services/form-service';

/**
 * POST /api/forms/[slug]/submit — submit a published form (Phase 6,
 * extended with multipart uploads by the Forms GHL file-upload work).
 * Public: no auth required (anonymous submissions store
 * submitterId null; a signed-in user's id is recorded instead).
 *
 * Two bodies, same validation against the STORED schema:
 * - application/json: { data: { [fieldId]: value } } — the original
 *   path, unchanged (forms without file fields).
 * - multipart/form-data: a `data` part holding the same JSON, plus
 *   one `file:<fieldId>` part per uploaded file. Files are uploaded
 *   server-side first (MIME + extension + size + magic bytes checked
 *   in lib/services/form-upload.ts) and only the file reference
 *   { name, url, size, mime } is stored in the submission.
 *
 * Rate-limited: 5 submissions per 15 minutes per IP (checked before
 * the body is read, for both content types).
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
  const session = await getRequestSession();
  const contentType = request.headers.get('content-type') ?? '';

  // Multipart path (forms with file fields).
  if (contentType.includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return invalidBody('Invalid form data');
    }
    const rawData = form.get('data');
    let data: unknown = {};
    if (typeof rawData === 'string' && rawData.trim() !== '') {
      try {
        data = JSON.parse(rawData);
      } catch {
        return invalidBody('Invalid submission data');
      }
    }
    const files: Record<string, MultipartFileInput> = {};
    for (const [key, value] of form.entries()) {
      // Only `file:<fieldId>` parts are files; anything else (e.g. a
      // stray field) is ignored — the data JSON is the source of truth
      // for non-file values.
      if (key.startsWith('file:') && value instanceof File) {
        files[key.slice('file:'.length)] = {
          name: value.name,
          type: value.type,
          size: value.size,
          // Lazy read: validation reads the bytes only after the cheap
          // MIME/extension checks pass.
          arrayBuffer: () => value.arrayBuffer(),
        };
      }
    }
    const result = await submitFormMultipartService(slug, data, files, session?.id);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, fieldErrors: result.fieldErrors },
        { status: result.status },
      );
    }
    return NextResponse.json({ ok: true, submissionId: result.submissionId }, { status: 201 });
  }

  // JSON path (unchanged — forms without file fields).
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const data =
    body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).data
      : undefined;
  const result = await submitFormService(slug, data, session?.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, fieldErrors: result.fieldErrors },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true, submissionId: result.submissionId }, { status: 201 });
}
