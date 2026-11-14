/**
 * Assignment access checks (shared by the instructor + admin APIs).
 *
 * A teacher may manage an assignment only when they teach its course.
 * An admin may manage any assignment. Students never manage
 * assignments — they only submit (see the student submit route).
 */
import type { SessionUser } from './auth';
import { hasAdminCapability } from './rbac';
import { getCourseById } from './db/courses';
import type { Assignment } from './db/types';

/** True when the session user may create/edit/delete/grade this assignment. */
export async function canManageAssignment(
  session: SessionUser,
  assignment: Assignment,
): Promise<boolean> {
  if (hasAdminCapability(session)) return true;
  const course = await getCourseById(assignment.courseId);
  return course?.instructorId === session.id;
}
