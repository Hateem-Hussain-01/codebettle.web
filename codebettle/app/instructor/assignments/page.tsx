import { connection } from 'next/server';
import InstructorAssignmentsClient from './instructor-assignments-client';

/**
 * Instructor > Assignments.
 * Server wrapper only: the list loads client-side from
 * /api/instructor/assignments. The instructor layout enforces the
 * teacher capability server-side.
 */
export default async function InstructorAssignmentsPage() {
  await connection();
  return <InstructorAssignmentsClient />;
}
