import { connection } from 'next/server';
import AssignmentDetailClient from '@/components/assignments/AssignmentDetailClient';

/**
 * Admin > Assignments > [id] — one assignment with its Colab link
 * submissions and grading. Server wrapper only: the detail loads
 * client-side from /api/admin/assignments/[id]. Grading uses the
 * shared grade endpoint (admins may grade any submission).
 */
export default async function AdminAssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  return (
    <AssignmentDetailClient assignmentId={id} apiBase="/api/admin" backHref="/admin/assignments" />
  );
}
