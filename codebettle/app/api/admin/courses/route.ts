import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdmin, serviceError } from '@/lib/api-helpers';
import { courseCreateSchema, courseCategories, courseLevels, courseStatuses } from '@/lib/api-schemas';
import { listCourses } from '@/lib/db/courses';
import { createCourseService } from '@/lib/services/course-service';
import type { CourseCategory, CourseLevel, CourseStatus } from '@/lib/db/types';

/**
 * GET /api/admin/courses — paginated course list (admin only).
 * Query params: page, limit, search, category, level, status, instructorId.
 * POST /api/admin/courses — create a course (admin only; draft).
 * Business logic lives in lib/services/course-service.ts.
 */
function asEnum<T extends readonly string[]>(value: string | null, allowed: T): T[number] | undefined {
  if (value === null) return undefined;
  return (allowed as readonly string[]).includes(value) ? (value as T[number]) : undefined;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const page = await listCourses({
    search: params.get('search') ?? undefined,
    category: asEnum(params.get('category'), courseCategories) as CourseCategory | undefined,
    level: asEnum(params.get('level'), courseLevels) as CourseLevel | undefined,
    status: asEnum(params.get('status'), courseStatuses) as CourseStatus | undefined,
    instructorId: params.get('instructorId') ?? undefined,
    page: params.get('page') ?? undefined,
    limit: params.get('limit') ?? undefined,
  });
  return NextResponse.json({
    courses: page.items,
    page: page.page,
    totalPages: page.totalPages,
    total: page.total,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = courseCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid course details' }, { status: 400 });
  }
  const result = await createCourseService(auth.session, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ course: result.course }, { status: 201 });
}
