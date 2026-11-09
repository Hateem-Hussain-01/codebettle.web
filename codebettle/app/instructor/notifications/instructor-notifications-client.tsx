'use client';
import NotificationsClient, {
  type NotificationsClientProps,
} from '@/app/student/notifications/student-notifications-client';

/**
 * Instructor notifications — thin wrapper around the shared
 * notifications client (same list, mark-read, delete, pagination and
 * preferences UI, fed with the instructor's own data by the page).
 */
export default function InstructorNotificationsClient(props: NotificationsClientProps) {
  return <NotificationsClient {...props} />;
}
