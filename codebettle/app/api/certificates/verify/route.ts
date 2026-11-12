import { NextRequest, NextResponse } from 'next/server';
import { getCertificateByToken } from '@/lib/db/certificates';
import { getCourseCertificateInfo } from '@/lib/db/courses';
import { getEnrollmentById } from '@/lib/db/enrollments';
import { getUserById } from '@/lib/db/users';

/**
 * GET /api/certificates/verify?token=… — public certificate check (Phase 7, states added Phase 2).
 * Anyone with a certificate's verification token (printed on the
 * certificate itself) can confirm it is genuine. The response carries
 * ONLY public facts — student name, course title, certificate number,
 * issued date, course dates (enrolment -> completion). No ids, no
 * email, no token echo: the token is the lookup key, not something to
 * hand back.
 *
 * States (status field):
 * - valid: the certificate is genuine. `valid: true` is kept for
 *   backwards compatibility with the original four-facts response.
 * - revoked: an admin revoked the certificate. HTTP 200 with
 *   valid: false, the certificate number and the revocation date —
 *   the caller needs to know WHICH certificate is revoked.
 * - not_found: no certificate matches the token. HTTP 404.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')?.trim();
  if (!token) {
    return NextResponse.json({ error: 'A verification token is required' }, { status: 400 });
  }
  const certificate = await getCertificateByToken(token);
  if (!certificate) {
    return NextResponse.json({ status: 'not_found', error: 'Certificate not found' }, { status: 404 });
  }
  if (certificate.revokedAt) {
    return NextResponse.json({
      status: 'revoked',
      valid: false,
      certificateNumber: certificate.certificateNumber,
      revokedAt: certificate.revokedAt,
    });
  }
  const [student, course, enrollment] = await Promise.all([
    getUserById(certificate.studentId),
    getCourseCertificateInfo(certificate.courseId),
    getEnrollmentById(certificate.enrollmentId),
  ]);
  return NextResponse.json({
    status: 'valid',
    valid: true,
    studentName: student?.name ?? 'Unknown student',
    courseTitle: course?.title ?? 'Unknown course',
    certificateNumber: certificate.certificateNumber,
    issuedAt: certificate.issuedAt,
    enrolledAt: enrollment?.enrolledAt ?? null,
    completedAt: enrollment?.completedAt ?? null,
  });
}
