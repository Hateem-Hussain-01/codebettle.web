import { notFound } from 'next/navigation';
import { getSupportRequestById } from '@/lib/db/support-requests';
import { getCourseById } from '@/lib/db/courses';
import { getUserById } from '@/lib/db/users';
import type { AdminRequest } from '@/components/requests/request-types';
import RequestDetailClient from './request-detail-client';

/**
 * Admin request detail (Phase 3, Worker C). The detail is loaded +
 * enriched server-side (the API returns a bare row — no student
 * name/email or course title). The admin layout enforces the
 * 'requests' area server-side.
 */
export default async function AdminRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getSupportRequestById(id);
  if (!row) notFound();
  const [student, course] = await Promise.all([
    getUserById(row.studentId),
    row.courseId ? getCourseById(row.courseId) : Promise.resolve(null),
  ]);
  const initialRequest: AdminRequest = {
    ...row,
    studentName: student?.name ?? 'Unknown student',
    studentEmail: student?.email ?? '',
    courseTitle: course?.title ?? null,
  };
  return <RequestDetailClient initialRequest={initialRequest} />;
}
