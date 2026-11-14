import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, invalidBody, readJson, requireRoles, serviceError } from '@/lib/api-helpers';
import { instructorCourseUpdateSchema } from '@/lib/api-schemas';
import { loadCourseForEditByUrlKey, updateCourseService } from '@/lib/services/course-service';

/**
 * PATCH /api/instructor/courses/[id] — edit a course the instructor teaches.
 * The [id] path param is the course's urlKey (opaque instructor-portal
 * key), never its raw id: a raw id 404s here. Status and instructorId
 * changes are rejected with 403 (admin-only); the schema accepts them
 * on purpose so the service can reject them instead of silently
 * dropping them. certificateTemplateHtml is NOT in the instructor
 * schema at all (ADM-03): only admins may set the certificate
 * template, so the field is dropped at the boundary.
 *
 * INST-03: the ownership check runs BEFORE body validation — an
 * instructor PATCHing someone else's course gets 403 even with an empty
 * body, instead of a 400 ("Nothing to update") that leaks behaviour.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['instructor']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const { id } = await params;

  const allowed = await loadCourseForEditByUrlKey(auth.session, id);
  if ('error' in allowed) return serviceError(allowed);
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = instructorCourseUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid course details' }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  const result = await updateCourseService(auth.session, allowed.course.id, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ course: result.course });
}
