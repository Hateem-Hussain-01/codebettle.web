import { connection } from 'next/server';
import { listAnnouncements } from '@/lib/db/announcements';
import AnnouncementsClient from './announcements-client';

/**
 * Admin announcements — server wrapper (Phase 2).
 * Fetches all announcements on the server and passes them to the client
 * component, which keeps the local add/delete state.
 */
export default async function AdminAnnouncementsPage() {
  await connection();
  const announcements = await listAnnouncements();
  return <AnnouncementsClient announcements={announcements} />;
}
