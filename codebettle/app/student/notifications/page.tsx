import { getSiteWideAnnouncements } from '@/lib/db/announcements';
import StudentNotificationsClient from './student-notifications-client';

/**
 * Student notifications — server wrapper (Phase 2).
 * Fetches the site-wide announcements on the server and passes them to
 * the client component, which seeds its local notification list from them
 * (plus the two hardcoded items) exactly as before. Mark-read/delete stay
 * local-only.
 */
export default async function StudentNotificationsPage() {
  const announcements = await getSiteWideAnnouncements();
  return <StudentNotificationsClient announcements={announcements} />;
}
