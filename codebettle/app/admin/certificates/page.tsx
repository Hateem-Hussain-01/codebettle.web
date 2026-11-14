import { connection } from 'next/server';
import { getAllUsers } from '@/lib/db/users';
import { getAllCourses } from '@/lib/db/courses';
import { listEnrollments } from '@/lib/db/enrollments';
import { listCertificates } from '@/lib/db/certificates';
import CertificatesClient from './certificates-client';

/**
 * Admin certificates — server wrapper (Phase 3).
 * The certificate list is fetched client-side from
 * GET /api/admin/certificates with real pagination (replacing the
 * per-student-fetch workaround). The wrapper only passes the
 * student/course maps and the completed, certificate-free enrolments
 * the issue-certificate form offers.
 */
export default async function AdminCertificatesPage() {
  await connection();
  const students = await getAllUsers();
  const courses = await getAllCourses();

  // Completed enrolments that do not have a certificate yet — and whose
  // payment is verified (SECURITY NEW-1: a pending-payment enrolment is
  // never offered for issuing, matching the issueCertificate gate).
  const { items: enrollments } = await listEnrollments({ limit: '100' });
  const { items: certificates } = await listCertificates({ limit: '100' });
  const certifiedEnrollmentIds = new Set(certificates.map((c) => c.enrollmentId));
  const eligibleEnrollments = enrollments.filter(
    (e) =>
      e.isCompleted &&
      (e.paymentStatus === 'paid' || e.paymentStatus === 'free') &&
      !certifiedEnrollmentIds.has(e.id),
  );

  return (
    <CertificatesClient
      students={students}
      courses={courses}
      eligibleEnrollments={eligibleEnrollments}
    />
  );
}
