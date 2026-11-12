import { connection } from 'next/server';
import SubmissionsClient from './submissions-client';

/**
 * Admin form submissions (Phase 6, Worker B — admin UI).
 * Server wrapper only: submissions are loaded client-side from
 * GET /api/admin/forms/[id]/submissions (Worker A). The admin layout
 * enforces the 'forms' area server-side once Worker A adds it to
 * ADMIN_AREAS.
 */
export default async function AdminFormSubmissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  return <SubmissionsClient formId={id} />;
}
