import { connection } from 'next/server';
import { listContactMessages } from '@/lib/db/contact-messages';
import MessagesClient from './messages-client';

/**
 * Admin inbox — server wrapper (Phase 7).
 * Fetches the newest contact-form messages on the server and passes
 * them to the client component, which handles mark-read and delete
 * through the admin messages API.
 */
export default async function AdminMessagesPage() {
  await connection();
  const page = await listContactMessages({ limit: '25' });
  return <MessagesClient initialMessages={page.items} total={page.total} />;
}
