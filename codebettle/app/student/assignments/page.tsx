import { connection } from 'next/server';
import StudentAssignmentsClient from './student-assignments-client';

/**
 * Student > Assignments.
 * Server wrapper only: the list loads client-side from
 * /api/student/assignments. The student layout enforces the
 * 'student' primary role server-side.
 */
export default async function StudentAssignmentsPage() {
  await connection();
  return <StudentAssignmentsClient />;
}
