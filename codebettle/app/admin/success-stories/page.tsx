import { connection } from 'next/server';
import SuccessStoriesClient from './success-stories-client';

/**
 * Admin success story submissions list.
 * Server wrapper only: the list is loaded client-side from
 * GET /api/admin/success-stories. The admin layout enforces the
 * 'success-stories' area server-side.
 */
export default async function AdminSuccessStoriesPage() {
  await connection();
  return <SuccessStoriesClient />;
}
