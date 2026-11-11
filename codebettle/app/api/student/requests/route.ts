import { NextRequest, NextResponse } from 'next/server';
import {
  assertNotViewAs,
  invalidBody,
  requireRoles,
  serviceError,
} from '@/lib/api-helpers';
import { checkRateLimit, supportRequestRateLimitKey } from '@/lib/rate-limit';
import {
  createSupportRequestService,
  isSupportRequestCategory,
} from '@/lib/services/support-request-service';
import { listSupportRequestsForStudent } from '@/lib/db/support-requests';

/**
 * Support requests (Phase 3, Module 7) — student side.
 *
 * GET /api/student/requests — the student's own requests, newest
 * first, paginated (?page, ?limit). Student only; studentId always
 * comes from the session.
 *
 * POST /api/student/requests — file a request. Student only, own
 * only (studentId comes from the session, never the body). Multipart
 * FormData: category, subject, message, courseId? (must be a course
 * the student is enrolled in), attachment file? (≤5 MB, pdf/doc/docx/
 * jpg/png) or attachmentPath? (a path previously uploaded through
 * POST /api/student/requests/upload). Rate-limited 5/15 min per IP,
 * same pattern as POST /api/contact. On create: persisted + audit +
 * admins notified (best-effort).
 */
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const page = await listSupportRequestsForStudent(auth.session.id, {
    page: params.get('page') ?? undefined,
    limit: params.get('limit') ?? undefined,
  });
  return NextResponse.json({
    requests: page.items,
    page: page.page,
    limit: page.limit,
    total: page.total,
    totalPages: page.totalPages,
    hasNext: page.hasNext,
    hasPrev: page.hasPrev,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(['student']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const limit = checkRateLimit(supportRequestRateLimitKey(clientIp(request)), 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return invalidBody('Expected multipart form data');
  }
  const category = form.get('category');
  const subject = form.get('subject');
  const message = form.get('message');
  const courseId = form.get('courseId');
  const attachmentPath = form.get('attachmentPath');
  const file = form.get('attachment') ?? form.get('file');
  if (
    typeof category !== 'string' ||
    !isSupportRequestCategory(category) ||
    typeof subject !== 'string' ||
    typeof message !== 'string'
  ) {
    return invalidBody('category, subject and message are required');
  }
  if (file !== null && !(file instanceof File)) {
    return invalidBody('attachment must be a file');
  }
  // An empty file input (no file chosen) arrives as a 0-byte File —
  // treated as no attachment below (file.size > 0 check).
  const result = await createSupportRequestService(auth.session, {
    category,
    subject,
    message,
    courseId: typeof courseId === 'string' && courseId.trim() ? courseId.trim() : undefined,
    attachmentPath:
      typeof attachmentPath === 'string' && attachmentPath.trim()
        ? attachmentPath.trim()
        : undefined,
    attachment:
      file instanceof File && file.size > 0
        ? {
            name: file.name,
            type: file.type,
            size: file.size,
            arrayBuffer: () => file.arrayBuffer(),
          }
        : undefined,
  });
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ request: result.request }, { status: 201 });
}
