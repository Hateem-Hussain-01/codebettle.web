import { connection } from 'next/server';
import { getAllUsers } from '@/lib/db/users';
import { getCourseById } from '@/lib/db/courses';
import { getCertificatesByStudent } from '@/lib/db/certificates';
import CertificatesClient from './certificates-client';
import type { Course, SafeUser } from '@/lib/db/types';

/**
 * Admin certificates — server wrapper (Phase 2).
 * There is no listCertificates repository function, so certificates are
 * collected per student via getCertificatesByStudent and flattened
 * (sorted by issued date, matching the old seed-array order).
 * Student/course lookups become maps passed as props.
 */
export default async function AdminCertificatesPage() {
  await connection();
  const users = await getAllUsers();
  const certificates = (await Promise.all(users.map((u) => getCertificatesByStudent(u.id)))).flat();
  certificates.sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));

  const students: Record<string, SafeUser> = {};
  for (const u of users) students[u.id] = u;

  const courses: Record<string, Course> = {};
  for (const id of [...new Set(certificates.map((c) => c.courseId))]) {
    const course = await getCourseById(id);
    if (course) courses[id] = course;
  }

  return <CertificatesClient certificates={certificates} students={students} courses={courses} />;
}
