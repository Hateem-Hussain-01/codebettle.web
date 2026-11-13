import { connection } from 'next/server';
import EmailTemplateEditorClient from '../email-template-editor-client';

/**
 * Admin edit email template (email builder).
 * Server wrapper only — the editor loads the template client-side
 * from GET /api/admin/email-templates/[id]. The admin layout enforces
 * the 'email-templates' area server-side.
 */
export default async function EditEmailTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  return <EmailTemplateEditorClient templateId={id} />;
}
