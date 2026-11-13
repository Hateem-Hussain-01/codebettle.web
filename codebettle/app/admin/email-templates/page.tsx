import { connection } from 'next/server';
import EmailTemplatesClient from './email-templates-client';

/**
 * Admin email templates list (email builder).
 * Server wrapper only: the list is loaded client-side from
 * GET /api/admin/email-templates. The admin layout enforces the
 * 'email-templates' area server-side.
 */
export default async function AdminEmailTemplatesPage() {
  await connection();
  return <EmailTemplatesClient />;
}
