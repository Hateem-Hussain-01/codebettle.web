import { NextRequest, NextResponse } from 'next/server';
import { applicationUploadRateLimitKey, checkRateLimit } from '@/lib/rate-limit';
import {
  deleteApplicationFile,
  isApplicationFilePath,
  uploadApplicationFile,
  type ApplicationFileKind,
} from '@/lib/services/application-storage';

/**
 * POST /api/applications/upload — upload one instructor-application file
 * (PUBLIC, no auth: the become-instructor form). multipart/form-data
 * with a `file` field and a `kind` field (`cv` or `demo`).
 * - kind=cv: PDF/DOC/DOCX, 5 MB max.
 * - kind=demo: MP4/WebM/MOV, 100 MB max.
 * Returns { path }: store the path as the application's cvUrl /
 * demoRecordingUrl when submitting the form. The file goes to the
 * PRIVATE `application-files` bucket in Supabase Storage — the path is
 * not a public URL; admins open it through a signed URL
 * (GET /api/admin/applications/[id]/file).
 *
 * Rate-limited (10 uploads per 15 minutes per IP) so the public form
 * cannot be used to flood Storage. When the Supabase service-role key
 * is not configured, this returns 503 with a plain message — never a
 * stack trace, never the key. When the `application-files` bucket does
 * not exist yet in Supabase Storage, this returns 503 naming the bucket
 * (create it in the dashboard: Storage -> New bucket ->
 * `application-files`, Private).
 *
 * DELETE /api/applications/upload?path=<storage path> — Module 3
 * orphan cleanup: the become-instructor form calls this for each file
 * it uploaded when the final application POST fails, so a failed
 * submit does not leave orphaned CVs/demo recordings in Storage.
 * Only paths the upload route itself returns are accepted
 * (isApplicationFilePath); anything else is a 400. Same rate limit as
 * uploads. Best-effort by design — a delete failure never blocks the
 * form's error message.
 */
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(applicationUploadRateLimitKey(clientIp(request)), 10, 15 * 60 * 1000);
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
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }
  const kind = form.get('kind');
  if (kind !== 'cv' && kind !== 'demo') {
    return NextResponse.json({ error: 'A file kind is required (cv or demo)' }, { status: 400 });
  }
  const file = form.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'A file is required' }, { status: 400 });
  }
  try {
    const { path } = await uploadApplicationFile(kind as ApplicationFileKind, {
      name: file.name,
      type: file.type,
      size: file.size,
      arrayBuffer: await file.arrayBuffer(),
    });
    return NextResponse.json({ path });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (
      message.includes('SUPABASE_SERVICE_ROLE_KEY') ||
      message.includes('Supabase URL is not set')
    ) {
      return NextResponse.json(
        { error: 'File uploads are not configured yet (Supabase service-role key missing)' },
        { status: 503 },
      );
    }
    if (message.includes('Bucket not found')) {
      return NextResponse.json(
        {
          error:
            'File uploads are not set up yet (the application-files bucket does not exist in Supabase Storage)',
        },
        { status: 503 },
      );
    }
    if (
      message.includes('Only PDF, DOC or DOCX') ||
      message.includes('Only MP4, WebM or MOV') ||
      message.includes('5 MB or smaller') ||
      message.includes('100 MB or smaller')
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'File upload failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const limit = checkRateLimit(applicationUploadRateLimitKey(clientIp(request)), 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many uploads. Please try again later.' },
      { status: 429 },
    );
  }
  const path = request.nextUrl.searchParams.get('path');
  if (!path || !isApplicationFilePath(path)) {
    return NextResponse.json({ error: 'A valid uploaded file path is required' }, { status: 400 });
  }
  try {
    await deleteApplicationFile(path);
    return NextResponse.json({ deleted: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (
      message.includes('SUPABASE_SERVICE_ROLE_KEY') ||
      message.includes('Supabase URL is not set')
    ) {
      return NextResponse.json(
        { error: 'File uploads are not configured yet (Supabase service-role key missing)' },
        { status: 503 },
      );
    }
    if (message.includes('Bucket not found')) {
      return NextResponse.json(
        {
          error:
            'File uploads are not set up yet (the application-files bucket does not exist in Supabase Storage)',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'File delete failed' }, { status: 500 });
  }
}
