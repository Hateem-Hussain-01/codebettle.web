import { NextRequest, NextResponse } from 'next/server';
import { getRequestSession, hasAdminCapability } from '@/lib/api-helpers';
import { getCertificateById } from '@/lib/db/certificates';
import { getEnrollmentBatchLabel } from '@/lib/db/batches';
import { getCourseCertificateInfo, getCourseCertificateTemplate } from '@/lib/db/courses';
import { getUserById } from '@/lib/db/users';
import { buildCertificateHtml } from '@/lib/certificates/template';
import { classifyRenderError, renderCertificatePdf } from '@/lib/certificates/render-pdf';

/**
 * Vercel Hobby gives serverless functions 10s by default; a cold
 * start extracts the ~70 MB Chromium archive to /tmp, launches the
 * browser and renders the PDF, which easily exceeds that. 60s is the
 * Hobby maximum — the render is a single on-demand download, so the
 * extra headroom only ever buys the cold start, never a slow page.
 */
export const maxDuration = 60;

/**
 * GET /api/certificates/[id]/download — on-demand certificate PDF (Phase 2).
 *
 * Generates the PDF from the HTML template at request time and returns
 * it as a download. The PDF is NEVER stored and the student NEVER gets
 * HTML. Template selection (lib/certificates/template.ts): the course's
 * own attached template when one exists, otherwise the default Python
 * design. The QR in the PDF encodes the verify URL for the
 * certificate's verification token, with the CodeBettle bee in its
 * centre between the dots (see lib/certificates/qr.ts).
 *
 * Access: the certificate's own student, or any admin. Anyone else
 * gets 403 — a certificate id is not a capability.
 * A revoked certificate still downloads (the verify page is the source
 * of truth for validity — it shows revoked/invalid for the same token).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getRequestSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { id } = await params;
  const certificate = await getCertificateById(id);
  if (!certificate) return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
  if (session.id !== certificate.studentId && !hasAdminCapability(session)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const [course, courseTemplateHtml, student] = await Promise.all([
    getCourseCertificateInfo(certificate.courseId),
    getCourseCertificateTemplate(certificate.courseId),
    getUserById(certificate.studentId),
  ]);
  if (!course || !student) return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });

  // The enrolment's batch ("BATCH-<n>") is the fallback for
  // certificates issued before batches existed (stored batch null).
  // A failure here never blocks the download — the stored batch (or
  // the legacy Python default) still applies.
  const enrollmentBatch = await getEnrollmentBatchLabel(certificate.enrollmentId).catch(() => null);

  let built: Awaited<ReturnType<typeof buildCertificateHtml>>;
  try {
    built = await buildCertificateHtml({
      studentName: student.name,
      courseSlug: course.slug,
      courseTitle: course.title,
      courseThumbnail: course.thumbnail,
      courseTemplateHtml,
      batch: certificate.batch ?? null,
      enrollmentBatch,
      certificateNumber: certificate.certificateNumber,
      verificationToken: certificate.verificationToken,
    });
  } catch (error) {
    console.error(`Certificate HTML build failed for ${certificate.id}:`, error);
    return NextResponse.json({ error: 'Could not build the certificate. Please try again.' }, { status: 500 });
  }

  let pdf: Buffer;
  try {
    pdf = await renderCertificatePdf(built.html);
  } catch (error) {
    // Structured log (server-side only): which render step failed and
    // why, so the cause can be read from the Vercel dashboard. The
    // student only ever sees the generic message (or the distinct
    // "service unavailable" hint when the Chromium binary itself is
    // missing) — no stage, token, id or internal path leaks out.
    const { stage, userMessage } = classifyRenderError(error);
    console.error(
      JSON.stringify({
        event: 'certificate-pdf-render-failed',
        certificateId: certificate.id,
        stage,
        errorName: error instanceof Error ? error.name : 'unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
      }),
    );
    return NextResponse.json({ error: userMessage }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="CodeBettle-Certificate-${certificate.certificateNumber}.pdf"`,
      'Content-Length': String(pdf.length),
      'Cache-Control': 'no-store',
    },
  });
}
