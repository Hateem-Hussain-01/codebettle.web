import { connection } from 'next/server';
import FormsClient from './forms-client';

/**
 * Admin forms list (Phase 6, Worker B — admin UI).
 * Server wrapper only: the list is loaded client-side from
 * GET /api/admin/forms (Worker A), because no lib/db forms layer
 * exists for this page to call. The admin layout enforces the
 * 'forms' area server-side once Worker A adds it to ADMIN_AREAS.
 */
export default async function AdminFormsPage() {
  await connection();
  return <FormsClient />;
}
