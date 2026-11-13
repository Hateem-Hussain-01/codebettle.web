import { connection } from 'next/server';
import PageBuilderClient from './page-builder-client';

/**
 * Admin Page Builder list.
 * Server wrapper only: the list is loaded client-side from
 * GET /api/admin/page-builder. The admin layout enforces the
 * 'page-builder' area server-side (LAST in the sidebar, by Eman's
 * instruction — its own section, not mixed into another one).
 */
export default async function AdminPageBuilderPage() {
  await connection();
  return <PageBuilderClient />;
}
