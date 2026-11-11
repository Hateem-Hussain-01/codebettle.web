import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, invalidBody, requireRoles } from '@/lib/api-helpers';
import { checkRateLimit, supportRequestRateLimitKey } from '@/lib/rate-limit';
import { uploadSupportRequestAttachment } from '@/lib/services/support-request-service';

/**
 * POST /api/student/requests/upload — upload one support-request
 * attachment on its own (Phase 3, student only). Multipart FormData
 * with a `file` field (≤5 MB, pdf/doc/docx/jpg/png). Returns the
 * private-bucket storage path ({ path }), which the caller passes as
 * `attachmentPath` when creating the request — the path is never a
 * public URL. Rate-limited 5/15 min per IP, sharing the budget with
 * the create route. A missing service-role key is 503 (uploads not
 * configured); a bad file is 400.
 */
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const limit = checkRateLimit(supportRequestRateLimitKey(clientIp(request)), 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many uploads. Please try again later.' },
      { status: 429 },
    );
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return invalidBody('Expected multipart form data');
  }
  const file = form.get('file') ?? form.get('attachment');
  if (!(file instanceof File) || file.size === 0) {
    return invalidBody('A file is required');
  }
  try {
    const { path } = await uploadSupportRequestAttachment({
      name: file.name,
      type: file.type,
      size: file.size,
      arrayBuffer: () => file.arrayBuffer(),
    });
    return NextResponse.json({ path });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Attachment upload failed';
    if (
      message.includes('SUPABASE_SERVICE_ROLE_KEY') ||
      message.includes('Supabase URL is not set')
    ) {
      return NextResponse.json(
        { error: 'Attachment uploads are not configured yet' },
        { status: 503 },
      );
    }
    if (
      message.includes('Only PDF') ||
      message.includes('5 MB or smaller')
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Attachment upload failed' }, { status: 500 });
  }
}
