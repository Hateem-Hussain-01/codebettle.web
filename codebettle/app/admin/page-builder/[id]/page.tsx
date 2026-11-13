import { connection } from 'next/server';
import PageBuilderEditorClient from './page-builder-editor-client';

/**
 * Admin Page Builder editor.
 * Server wrapper only: the page is loaded client-side from
 * GET /api/admin/page-builder/[id]. The admin layout enforces the
 * 'page-builder' area server-side.
 */
export default async function AdminPageBuilderEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  return <PageBuilderEditorClient pageId={id} />;
}
