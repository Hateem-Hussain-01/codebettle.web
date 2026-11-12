import { connection } from 'next/server';
import BuilderClient from './builder-client';

/**
 * Admin form builder (Phase 6, Worker B — admin UI).
 * Server wrapper only: the form is loaded client-side from
 * GET /api/admin/forms/[id] (Worker A). The admin layout enforces
 * the 'forms' area server-side once Worker A adds it to ADMIN_AREAS.
 */
export default async function AdminFormBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  return <BuilderClient formId={id} />;
}
