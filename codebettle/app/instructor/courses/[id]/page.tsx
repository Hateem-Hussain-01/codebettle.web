import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getBatchesByCourse } from '@/lib/db/batches';
import { getEnrollmentsByCourse } from '@/lib/db/enrollments';
import { getUserById } from '@/lib/db/users';
import { hasCourseUrlKeyColumn } from '@/lib/db/courses';
import { loadCourseForEditByUrlKey } from '@/lib/services/course-service';
import Card from '@/components/ui/Card';
import InstructorCourseManageClient from './instructor-course-manage-client';

/**
 * Instructor course management — server wrapper (Phase 2).
 * Fetches the course and its enrolled students on the server and passes
 * them to the client component. Local edits (zoom link, recordings,
 * curriculum, mark complete) stay local-only (Phase 3 builds the write APIs).
 *
 * SECURITY (INST-01): this page renders the course's Zoom link and lesson
 * recording URLs — privileged data stripped from the public course API.
 * The layout only checks "is a teacher"; this page also enforces the
 * same ownership rule as the write endpoints (loadCourseForEditByUrlKey):
 * an instructor may open ONLY courses they teach; an admin may open any
 * course. A missing course and a course the instructor does not own
 * both 404 (existence is not confirmed to a non-owner).
 *
 * SECURITY (opaque course key): the route param is the course's urlKey,
 * never its raw id. Raw ids (course-3, ...) are predictable and visible
 * in public course data, so a raw id in this URL 404s — as does another
 * instructor's key. The ownership check is the second layer behind the
 * unguessable key (defense in depth).
 *
 * MIGRATION: before codebettle-course-urlkey-migration.sql runs, no
 * course has a urlKey, so every key lookup returns null. That case is
 * shown as an honest "run the SQL" state instead of a 404, so an
 * instructor landing here from their course list is told what to do
 * rather than shown a dead page.
 */
export default async function InstructorCourseManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();
  const allowed = await loadCourseForEditByUrlKey(session, id);
  if ('error' in allowed) {
    // Distinguish "the migration has not run yet" from "no such course
    // / not yours": only the first gets the run-the-SQL state; the
    // second stays a plain 404 (existence is not confirmed).
    if (!(await hasCourseUrlKeyColumn())) {
      return (
        <Card className="py-16 text-center">
          <p className="text-foreground font-semibold mb-2">Course links are being upgraded</p>
          <p className="text-muted text-sm max-w-md mx-auto">
            The instructor pages now open courses by a private key, and the course keys have not been created yet.
            Run <code className="text-primary-text">codebettle-course-urlkey-migration.sql</code> in the Supabase SQL
            Editor, then reopen your course from My Courses.
          </p>
        </Card>
      );
    }
    notFound();
  }
  const course = allowed.course;

  const enrollments = await getEnrollmentsByCourse(course.id);
  const enrolledStudents = (
    await Promise.all(
      enrollments.map(async (e) => ({ enrollment: e, student: await getUserById(e.studentId) })),
    )
  ).filter((item): item is { enrollment: typeof item.enrollment; student: NonNullable<typeof item.student> } => item.student !== null);

  // Batches of this course (for the per-student batch label). Empty when
  // the Batch table has not been created yet.
  const batches = await getBatchesByCourse(course.id);

  return <InstructorCourseManageClient course={course} enrolledStudents={enrolledStudents} batches={batches} />;
}
