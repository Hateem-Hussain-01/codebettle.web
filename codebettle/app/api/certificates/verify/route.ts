import { NextRequest, NextResponse } from 'next/server';
import { getCertificateByToken } from '@/lib/db/certificates';
import { getCourseById } from '@/lib/db/courses';
import { getUserById } from '@/lib/db/users';

/**
 * GET /api/certificates/verify?token=… — public certificate check (Phase 7).
 * Anyone with a certificate's verification token (printed on the
 * certificate itself) can confirm it is genuine. The response carries
 * ONLY the four public facts — student name, course title, certificate
 * number, issued date. No ids, no email, no token echo: the token is
 * the lookup key, not something to hand back.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')?.trim();
  if (!token) {
    return NextResponse.json({ error: 'A verification token is required' }, { status: 400 });
  }
  const certificate = await getCertificateByToken(token);
  if (!certificate) {
    return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
  }
  const [student, course] = await Promise.all([
    getUserById(certificate.studentId),
    getCourseById(certificate.courseId),
  ]);
  return NextResponse.json({
    valid: true,
    studentName: student?.name ?? 'Unknown student',
    courseTitle: course?.title ?? 'Unknown course',
    certificateNumber: certificate.certificateNumber,
    issuedAt: certificate.issuedAt,
  });
}
