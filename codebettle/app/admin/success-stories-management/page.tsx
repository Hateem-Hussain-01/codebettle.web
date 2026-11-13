import { connection } from 'next/server';
import ManagementClient from './management-client';

/**
 * Admin > Success Stories Management (PR #32).
 * Server wrapper only: the management UI loads client-side from the
 * /api/admin/success-stories-management/* routes. The admin layout
 * enforces the 'success-stories-management' area server-side.
 */
export default async function AdminSuccessStoriesManagementPage() {
  await connection();
  return <ManagementClient />;
}
