import { connection } from 'next/server';
import NavbarEditorClient from './navbar-editor-client';

/**
 * Admin > Navbar Editor (PR #32).
 * Server wrapper only: the editor loads client-side from
 * /api/admin/navbar-editor/* and GET /api/nav. The admin layout
 * enforces the 'navbar-editor' area server-side.
 */
export default async function AdminNavbarEditorPage() {
  await connection();
  return <NavbarEditorClient />;
}
