import { connection } from 'next/server';
import AssignmentDetailClient from '@/components/assignments/AssignmentDetailClient';

/**
 * Instructor > Assignments > [id] — one assignment with its Colab
 * link submissions and grading. Server wrapper only: the detail
 * loads client-side from /api/instructor/assignments/[id].
 */
export default async function InstructorAssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  return (
    <AssignmentDetailClient assignmentId={id} apiBase="/api/instructor" backHref="/instructor/assignments" />
  );
}
