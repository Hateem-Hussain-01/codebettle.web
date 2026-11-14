import { connection } from 'next/server';
import AdminAssignmentsClient from './admin-assignments-client';

/**
 * Admin > Assignments.
 * Server wrapper only: the list loads client-side from
 * /api/admin/assignments. The admin layout enforces the
 * 'assignments' area server-side.
 */
export default async function AdminAssignmentsPage() {
  await connection();
  return <AdminAssignmentsClient />;
}
