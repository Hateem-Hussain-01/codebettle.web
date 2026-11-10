import { getSession } from '@/lib/auth';
import { getCoursesByInstructor } from '@/lib/db/courses';
import { listAnnouncements } from '@/lib/db/announcements';
import InstructorAnnouncementsClient from './instructor-announcements-client';

/**
 * Instructor announcements — server wrapper (Phase 2).
 * Fetches the instructor's courses and their announcements on the server
 * and passes them to the client component. New announcements stay
 * local-only (Phase 3 builds the real write API).
 */
export default async function InstructorAnnouncementsPage() {
  const session = await getSession();
  const myCourses = await getCoursesByInstructor(session!.id);
  const allAnnouncements = await listAnnouncements();
  const initialAnnouncements = allAnnouncements.filter((a) => a.authorId === session!.id);
  return (
    <InstructorAnnouncementsClient
      courses={myCourses}
      initialAnnouncements={initialAnnouncements}
      instructorId={session!.id}
    />
  );
}
