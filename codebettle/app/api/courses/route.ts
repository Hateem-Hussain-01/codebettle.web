import { NextRequest, NextResponse } from 'next/server';
import { listCourses } from '@/lib/db/courses';
import { toPublicCourse } from '@/lib/db/mappers';
import type { CourseCategory, CourseLevel, CourseStatus } from '@/lib/db/types';

/**
 * GET /api/courses — public course catalogue (paginated, searchable).
 * Query params: page, limit, search, category, level, status, instructorId.
 * No auth: the catalogue is public (same data the /courses page shows).
 * Unknown enum values are ignored (treated as no filter).
 * Zoom links, recording URLs and materials URLs are stripped
 * (toPublicCourse) — they are for enrolled students with a confirmed
 * payment only; the public catalogue must never carry them.
 */
const CATEGORIES = ['Web Development', 'Mobile Development', 'Data Science', 'UI/UX Design', 'DevOps', 'Programming'] as const;
const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
const STATUSES = ['draft', 'published', 'archived'] as const;

function asEnum<T extends readonly string[]>(value: string | null, allowed: T): T[number] | undefined {
  if (value === null) return undefined;
  return (allowed as readonly string[]).includes(value) ? (value as T[number]) : undefined;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = await listCourses({
    search: params.get('search') ?? undefined,
    category: asEnum(params.get('category'), CATEGORIES) as CourseCategory | undefined,
    level: asEnum(params.get('level'), LEVELS) as CourseLevel | undefined,
    status: asEnum(params.get('status'), STATUSES) as CourseStatus | undefined,
    instructorId: params.get('instructorId') ?? undefined,
    page: params.get('page') ?? undefined,
    limit: params.get('limit') ?? undefined,
  });
  return NextResponse.json({ ...page, items: page.items.map(toPublicCourse) });
}
