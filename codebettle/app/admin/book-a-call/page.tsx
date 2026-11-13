import { connection } from 'next/server';
import { isBookACallTableReady, listBookACalls } from '@/lib/db/book-a-call';
import BookACallClient from './book-a-call-client';

/**
 * Admin Book a Call — server wrapper (PR #33).
 * Fetches the newest call requests on the server and passes them to
 * the client component, which handles status changes and delete
 * through the admin book-a-call API. When the BookACall table does
 * not exist yet (migration not run), the client shows a "run the SQL"
 * state instead of an empty list.
 */
export default async function AdminBookACallPage() {
  await connection();
  const tableMissing = !(await isBookACallTableReady());
  const page = await listBookACalls({ limit: '25' });
  return <BookACallClient initialBookings={page.items} total={page.total} tableMissing={tableMissing} />;
}
