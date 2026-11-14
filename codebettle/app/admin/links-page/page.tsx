import { connection } from 'next/server';
import LinksPageClient from './links-page-client';

/**
 * Admin > Links Page.
 * Server wrapper only: the editor loads client-side from
 * /api/admin/links-page/*. The admin layout enforces the
 * 'links-page' area server-side.
 */
export default async function AdminLinksPagePage() {
  await connection();
  return <LinksPageClient />;
}
