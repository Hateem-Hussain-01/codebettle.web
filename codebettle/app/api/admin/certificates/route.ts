import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { certificateCreateSchema } from '@/lib/api-schemas';
import { listCertificates } from '@/lib/db/certificates';
import { issueCertificateWithRetry } from '@/lib/services/certificate-service';
import { onCertificateIssued } from '@/lib/services/notification-service';
import { logAudit } from '@/lib/db/audit';

/**
 * GET /api/admin/certificates — paginated certificates (admin only).
 * Query params: page, limit, studentId, courseId.
 * POST /api/admin/certificates — issue a certificate (admin only).
 * The enrolment must be completed and have no certificate yet (enforced
 * in the repository). When certificateNumber is omitted it is generated
 * as CB-<year>-<seq>, seq = existing count + 1, zero-padded to 3 digits,
 * via the certificate service, which retries the next seq on collision.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminArea('certificates');
  if ('error' in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const page = await listCertificates({
    studentId: params.get('studentId') ?? undefined,
    courseId: params.get('courseId') ?? undefined,
    page: params.get('page') ?? undefined,
    limit: params.get('limit') ?? undefined,
  });
  return NextResponse.json({
    certificates: page.items,
    page: page.page,
    totalPages: page.totalPages,
    total: page.total,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('certificates');
  if ('error' in auth) return auth.error;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = certificateCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Student, course and enrollment are required' }, { status: 400 });
  }
  const issued = await issueCertificateWithRetry(parsed.data);
  if ('error' in issued) return serviceError(issued);
  const certificateNumber = issued.certificate.certificateNumber;
  await logAudit({
    actorId: auth.session.id,
    action: 'certificate.issue',
    entity: 'certificate',
    entityId: issued.certificate.id,
    detail: certificateNumber,
  });
  // Notify the student (Phase 4 hook — best-effort, never throws).
  await onCertificateIssued(issued.certificate);
  return NextResponse.json({ certificate: issued.certificate }, { status: 201 });
}
