import { connection } from 'next/server';
import { isSubscriberTableReady, listSubscribers } from '@/lib/db/subscribers';
import SubscribersClient from './subscribers-client';

/**
 * Admin Subscribers — server wrapper (PR #33).
 * Fetches the newest newsletter subscribers on the server and passes
 * them to the client component, which handles unsubscribe (delete)
 * through the admin subscribers API. When the Subscriber table does
 * not exist yet (migration not run), the client shows a "run the SQL"
 * state instead of an empty list.
 */
export default async function AdminSubscribersPage() {
  await connection();
  const tableMissing = !(await isSubscriberTableReady());
  const page = await listSubscribers({ limit: '25' });
  return <SubscribersClient initialSubscribers={page.items} total={page.total} tableMissing={tableMissing} />;
}
