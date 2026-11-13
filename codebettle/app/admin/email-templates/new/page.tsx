import { connection } from 'next/server';
import EmailTemplateEditorClient from '../email-template-editor-client';

/**
 * Admin new email template (email builder).
 * Server wrapper only — the editor is client-side. The admin layout
 * enforces the 'email-templates' area server-side.
 */
export default async function NewEmailTemplatePage() {
  await connection();
  return <EmailTemplateEditorClient />;
}
