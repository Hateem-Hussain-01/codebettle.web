import { connection } from 'next/server';
import { isAmbassadorApplicationTableReady, listAmbassadorApplications } from '@/lib/db/ambassador-applications';
import AmbassadorsClient from './ambassadors-client';

/**
 * Admin Ambassadors — server wrapper (PR #33).
 * Fetches the newest ambassador applications on the server and passes
 * them to the client component, which handles approve/reject and
 * delete through the admin ambassadors API. When the
 * AmbassadorApplication table does not exist yet (migration not run),
 * the client shows a "run the SQL" state instead of an empty list.
 */
export default async function AdminAmbassadorsPage() {
  await connection();
  const tableMissing = !(await isAmbassadorApplicationTableReady());
  const page = await listAmbassadorApplications({ limit: '25' });
  return <AmbassadorsClient initialApplications={page.items} total={page.total} tableMissing={tableMissing} />;
}
