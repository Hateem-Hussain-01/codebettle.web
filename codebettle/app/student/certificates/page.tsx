import { getSession } from '@/lib/auth';
import { getCertificatesByStudent } from '@/lib/db/certificates';
import { getCoursesByIds } from '@/lib/db/courses';
import { toPublicCourse } from '@/lib/db/mappers';
import StudentCertificatesClient from './student-certificates-client';

/**
 * Student certificates — server wrapper (Phase 2).
 * Fetches the logged-in student's certificates and the matching courses
 * on the server and passes them to the client component. The download
 * (generating an HTML certificate in the browser) is unchanged.
 */
export default async function StudentCertificatesPage() {
  const session = await getSession();
  const certificates = await getCertificatesByStudent(session!.id);
  const courseIds = [...new Set(certificates.map((c) => c.courseId))];
  const coursesById: Record<string, ReturnType<typeof toPublicCourse>> = {};
  // One query for all certificate courses (Phase 7 perf — was a loop of getCourseById).
  for (const course of await getCoursesByIds(courseIds)) coursesById[course.id] = toPublicCourse(course);
  return (
    <StudentCertificatesClient
      certificates={certificates}
      coursesById={coursesById}
      studentName={session!.name}
    />
  );
}
