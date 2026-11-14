import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, invalidBody, readJson, requireRoles } from '@/lib/api-helpers';
import { hasAdminCapability } from '@/lib/rbac';
import { validateAssignment } from '@/lib/assignments';
import {
  areAssignmentTablesReady,
  createAssignment,
  listAssignmentsEnriched,
} from '@/lib/db/assignments';
import { getAllCourses, getCourseById, getCoursesByInstructor } from '@/lib/db/courses';
import { getBatchesByCourse } from '@/lib/db/batches';

/**
 * GET /api/instructor/assignments — the teacher's assignments (for the
 * courses they teach), enriched with course title, batch label and
 * submission/graded counts. Also returns the teacher's courses (with
 * their batches) for the create form, and `tablesReady` so the UI can
 * show a "run the SQL" state when the migration has not run yet.
 * A pure admin (NEW-12) sees ALL courses, so they are not locked out
 * of the read — an admin with no courses of their own would otherwise
 * see nothing. POST — create an assignment for one of the teacher's
 * own courses. Guard: requireRoles(['instructor', 'admin']). An admin
 * may create for any course; a pure teacher only for their own.
 */
export async function GET() {
  const auth = await requireRoles(['instructor', 'admin']);
  if ('error' in auth) return auth.error;
  const [tablesReady, courses] = await Promise.all([
    areAssignmentTablesReady(),
    hasAdminCapability(auth.session) ? getAllCourses() : getCoursesByInstructor(auth.session.id),
  ]);
  const assignments = await listAssignmentsEnriched(courses.map((c) => c.id));
  const coursesWithBatches = await Promise.all(
    courses.map(async (c) => ({ ...c, batches: await getBatchesByCourse(c.id) })),
  );
  return NextResponse.json({ assignments, courses: coursesWithBatches, tablesReady });
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(['instructor', 'admin']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  try {
    const body = await readJson(request);
    if (body === null) return invalidBody();
    const v = body as Record<string, unknown>;
    const input = {
      title: typeof v.title === 'string' ? v.title : '',
      description: typeof v.description === 'string' ? v.description : '',
      courseId: typeof v.courseId === 'string' ? v.courseId : '',
      batchId: typeof v.batchId === 'string' && v.batchId.length > 0 ? v.batchId : null,
      dueDate: typeof v.dueDate === 'string' && v.dueDate.length > 0 ? v.dueDate : null,
      maxMarks: typeof v.maxMarks === 'number' ? v.maxMarks : 0,
    };
    const error = validateAssignment(input);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const courses = await getCoursesByInstructor(auth.session.id);
    let course = courses.find((c) => c.id === input.courseId);
    if (!course) {
      if (!hasAdminCapability(auth.session)) {
        return NextResponse.json({ error: 'You can only create assignments for your own courses' }, { status: 403 });
      }
      // An admin WITH the teacher flag may create for any course.
      course = (await getCourseById(input.courseId)) ?? undefined;
      if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
    if (input.batchId) {
      const batches = await getBatchesByCourse(input.courseId);
      if (!batches.some((b) => b.id === input.batchId)) {
        return NextResponse.json({ error: 'Batch not found for this course' }, { status: 400 });
      }
    }
    const assignment = await createAssignment({
      courseId: input.courseId,
      batchId: input.batchId,
      title: input.title.trim(),
      description: input.description.trim(),
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      maxMarks: input.maxMarks,
      createdBy: auth.session.id,
    });
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not create the assignment';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not create the assignment' }, { status: 500 });
  }
}
