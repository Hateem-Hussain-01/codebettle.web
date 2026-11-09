import { connection } from 'next/server';
import ImportClient from './import-client';

/**
 * Admin students import — server wrapper (Phase 4).
 * The import itself runs client-side against POST /api/admin/users/import
 * with a preview/review step before anything is written.
 */
export default async function AdminStudentsImportPage() {
  await connection();
  return <ImportClient />;
}
