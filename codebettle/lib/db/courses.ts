/**
 * Course repository (Phase 2, Prisma-backed).
 *
 * Same function names as the old lib/data/courses.ts. Every read includes
 * modules + lessons (nested, ordered by position) — the old data had them
 * nested, and pages read course.modules directly.
 *
 * createCourse / updateCourse exist for Phase 3 (admin course editor);
 * no Phase 2 UI calls them yet.
 */
import { getDb } from './client';
import { categoryToStorage, mapCourseRow } from './mappers';
import { parsePageParams, toPage, type Page } from './pagination';
import type { Course, CourseCategory, CourseLevel, CourseStatus } from './types';

export async function getCourseById(id: string): Promise<Course | null> {
  const row = await getDb()
    .orm.public.Course.where({ id })
    .include('modules', (m) =>
      m
        .orderBy((mod) => mod.position.asc())
        .include('lessons', (l) => l.orderBy((les) => les.position.asc())),
    )
    .first();
  if (!row) return null;
  return mapCourseRow(row, row.modules);
}

export async function getCourseBySlug(slug: string): Promise<Course | null> {
  const row = await getDb()
    .orm.public.Course.where({ slug })
    .include('modules', (m) =>
      m
        .orderBy((mod) => mod.position.asc())
        .include('lessons', (l) => l.orderBy((les) => les.position.asc())),
    )
    .first();
  if (!row) return null;
  return mapCourseRow(row, row.modules);
}

async function listWithCurriculum(
  base: ReturnType<typeof getDb>['orm']['public']['Course'],
  params: { limit: number; offset: number },
): Promise<Course[]> {
  const rows = await base
    .include('modules', (m) =>
      m
        .orderBy((mod) => mod.position.asc())
        .include('lessons', (l) => l.orderBy((les) => les.position.asc())),
    )
    .limit(params.limit)
    .offset(params.offset)
    .all();
  return rows.map((r) => mapCourseRow(r, r.modules));
}

export async function getPublishedCourses(): Promise<Course[]> {
  const rows = await getDb()
    .orm.public.Course.where({ status: 'published' })
    .include('modules', (m) =>
      m
        .orderBy((mod) => mod.position.asc())
        .include('lessons', (l) => l.orderBy((les) => les.position.asc())),
    )
    .orderBy((c) => c.createdAt.desc())
    .all();
  return rows.map((r) => mapCourseRow(r, r.modules));
}

export async function getFeaturedCourses(): Promise<Course[]> {
  const rows = await getDb()
    .orm.public.Course.where({ status: 'published' })
    .where((c) => c.isFeatured.eq(true))
    .include('modules', (m) =>
      m
        .orderBy((mod) => mod.position.asc())
        .include('lessons', (l) => l.orderBy((les) => les.position.asc())),
    )
    .orderBy((c) => c.createdAt.desc())
    .all();
  return rows.map((r) => mapCourseRow(r, r.modules));
}

export async function getCoursesByInstructor(instructorId: string): Promise<Course[]> {
  const rows = await getDb()
    .orm.public.Course.where({ instructorId })
    .include('modules', (m) =>
      m
        .orderBy((mod) => mod.position.asc())
        .include('lessons', (l) => l.orderBy((les) => les.position.asc())),
    )
    .orderBy((c) => c.createdAt.desc())
    .all();
  return rows.map((r) => mapCourseRow(r, r.modules));
}

export async function getAllCourses(): Promise<Course[]> {
  const rows = await getDb()
    .orm.public.Course.include('modules', (m) =>
      m
        .orderBy((mod) => mod.position.asc())
        .include('lessons', (l) => l.orderBy((les) => les.position.asc())),
    )
    .orderBy((c) => c.createdAt.desc())
    .all();
  return rows.map((r) => mapCourseRow(r, r.modules));
}

export interface ListCoursesOptions {
  search?: string;
  category?: CourseCategory;
  level?: CourseLevel;
  status?: CourseStatus;
  instructorId?: string;
  page?: string | string[];
  limit?: string | string[];
}

/** Paginated, searchable course list (public catalogue + admin lists). */
export async function listCourses(opts: ListCoursesOptions = {}): Promise<Page<Course>> {
  const params = parsePageParams({ page: opts.page, limit: opts.limit });
  let query = getDb().orm.public.Course.where((c) => c.deletedAt.isNull());
  if (opts.status) query = query.where({ status: opts.status });
  if (opts.instructorId) query = query.where({ instructorId: opts.instructorId });
  if (opts.category) query = query.where({ category: categoryToStorage(opts.category) });
  if (opts.level) query = query.where({ level: opts.level });
  if (opts.search) {
    const term = opts.search.trim();
    if (term) query = query.where((c) => c.title.ilike(`%${term}%`));
  }
  const total = (await query.all()).length;
  const items = await listWithCurriculum(query.orderBy((c) => c.createdAt.desc()), params);
  return toPage(items, total, params);
}

export interface CreateCourseInput {
  slug: string;
  title: string;
  description: string;
  longDescription: string;
  thumbnail: string;
  category: CourseCategory;
  level: CourseLevel;
  pricePkr: number;
  isFree: boolean;
  instructorId: string;
  zoomLink?: string;
  requirements?: string[];
  whatYouLearn?: string[];
  tags?: string[];
}

/** Create a course (draft). Curriculum (modules/lessons) is added separately in Phase 3. */
export async function createCourse(input: CreateCourseInput): Promise<Course> {
  const row = await getDb().orm.public.Course.create({
    slug: input.slug,
    title: input.title,
    description: input.description,
    longDescription: input.longDescription,
    thumbnail: input.thumbnail,
    category: categoryToStorage(input.category),
    level: input.level,
    pricePkr: input.pricePkr,
    isFree: input.isFree,
    instructorId: input.instructorId,
    zoomLink: input.zoomLink ?? null,
    status: 'draft',
    requirements: input.requirements ?? [],
    whatYouLearn: input.whatYouLearn ?? [],
    tags: input.tags ?? [],
  });
  return mapCourseRow(row, []);
}

export interface UpdateCourseInput {
  title?: string;
  description?: string;
  longDescription?: string;
  thumbnail?: string;
  category?: CourseCategory;
  level?: CourseLevel;
  pricePkr?: number;
  isFree?: boolean;
  instructorId?: string;
  zoomLink?: string | null;
  status?: CourseStatus;
  isFeatured?: boolean;
  isCompleted?: boolean;
  requirements?: string[];
  whatYouLearn?: string[];
  tags?: string[];
}

export async function updateCourse(id: string, input: UpdateCourseInput): Promise<Course | null> {
  const { category, ...rest } = input;
  const row = await getDb()
    .orm.public.Course.where({ id })
    .update({
      ...rest,
      ...(category !== undefined ? { category: categoryToStorage(category) } : {}),
    });
  if (!row) return null;
  return getCourseById(id);
}
