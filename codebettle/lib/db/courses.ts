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
import { categoryToStorage, mapCourseRow, mapLessonRow, mapModuleRow, stringToDate, stripUndefined } from './mappers';
import { parsePageParams, toPage, type Page } from './pagination';
import type { Course, CourseCategory, CourseLevel, CourseSchedule, CourseStatus, Lesson, Module } from './types';

export async function getCourseById(id: string): Promise<Course | null> {
  const row = await getDb()
    .orm.public.Course.where({ id })
    .where((c) => c.deletedAt.isNull())
    .include('modules', (m) =>
      m
        .orderBy((mod) => mod.position.asc())
        .include('lessons', (l) => l.orderBy((les) => les.position.asc())),
    )
    .first();
  if (!row) return null;
  return mapCourseRow(row, row.modules);
}

/**
 * Fetch several courses in ONE query (Phase 7 perf — replaces the
 * per-enrolment / per-id getCourseById loops in the student pages).
 * Returns them in input order; unknown ids are skipped; [] for [].
 */
export async function getCoursesByIds(ids: string[]): Promise<Course[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await getDb()
    .orm.public.Course.where((c) => c.id.in(unique))
    .where((c) => c.deletedAt.isNull())
    .include('modules', (m) =>
      m
        .orderBy((mod) => mod.position.asc())
        .include('lessons', (l) => l.orderBy((les) => les.position.asc())),
    )
    .all();
  const byId = new Map(rows.map((r) => [r.id, mapCourseRow(r, r.modules)]));
  return unique.map((id) => byId.get(id)).filter((c): c is Course => c !== undefined);
}

export async function getCourseBySlug(slug: string): Promise<Course | null> {
  const row = await getDb()
    .orm.public.Course.where({ slug })
    .where((c) => c.deletedAt.isNull())
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
    .where((c) => c.deletedAt.isNull())
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
    .where((c) => c.deletedAt.isNull())
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
    .where((c) => c.deletedAt.isNull())
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
    .orm.public.Course.where((c) => c.deletedAt.isNull())
    .include('modules', (m) =>
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
  schedule?: CourseSchedule | null;
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
    schedule: input.schedule ?? null,
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
  schedule?: CourseSchedule | null;
  status?: CourseStatus;
  isFeatured?: boolean;
  isCompleted?: boolean;
  requirements?: string[];
  whatYouLearn?: string[];
  tags?: string[];
  /** Rating stats — maintained by the review service (Phase 7), not by editors. */
  rating?: number;
  reviewCount?: number;
}

export async function updateCourse(id: string, input: UpdateCourseInput): Promise<Course | null> {
  const { category, ...rest } = input;
  const row = await getDb()
    .orm.public.Course.where({ id })
    .where((c) => c.deletedAt.isNull())
    .update(
      stripUndefined({
        ...rest,
        ...(category !== undefined ? { category: categoryToStorage(category) } : {}),
      }),
    );
  if (!row) return null;
  return getCourseById(id);
}

/** Soft delete: sets deletedAt. The row stays for enrolment/certificate history. Returns false when the course does not exist or is already deleted. */
export async function softDeleteCourse(id: string): Promise<boolean> {
  const row = await getDb()
    .orm.public.Course.where({ id })
    .where((c) => c.deletedAt.isNull())
    .update({ deletedAt: new Date() });
  return row !== null;
}

// ---------------------------------------------------------------------------
// Modules & lessons (Phase 3). Positions are 1-based and contiguous.
// The contract has @@unique([courseId, position]) / @@unique([moduleId,
// position]), so reordering goes through a temporary high offset first
// (10000+i) and only then to the final positions — a direct swap would
// collide with the unique constraint on the live database.
// ---------------------------------------------------------------------------

async function loadModuleWithLessons(id: string): Promise<Module | null> {
  const row = await getDb().orm.public.Module.where({ id }).first();
  if (!row) return null;
  const lessons = await getDb()
    .orm.public.Lesson.where({ moduleId: id })
    .orderBy((l) => l.position.asc())
    .all();
  return mapModuleRow(row, lessons);
}

async function moduleSiblings(courseId: string) {
  return getDb()
    .orm.public.Module.where({ courseId })
    .orderBy((m) => m.position.asc())
    .all();
}

async function lessonSiblings(moduleId: string) {
  return getDb()
    .orm.public.Lesson.where({ moduleId })
    .orderBy((l) => l.position.asc())
    .all();
}

/** Apply a new position order to a list of row ids (two-phase, unique-safe). */
async function applyModuleOrder(idsInOrder: string[]): Promise<void> {
  for (let i = 0; i < idsInOrder.length; i++) {
    await getDb().orm.public.Module.where({ id: idsInOrder[i] }).update({ position: 10000 + i });
  }
  for (let i = 0; i < idsInOrder.length; i++) {
    await getDb().orm.public.Module.where({ id: idsInOrder[i] }).update({ position: i + 1 });
  }
}

async function applyLessonOrder(idsInOrder: string[]): Promise<void> {
  for (let i = 0; i < idsInOrder.length; i++) {
    await getDb().orm.public.Lesson.where({ id: idsInOrder[i] }).update({ position: 10000 + i });
  }
  for (let i = 0; i < idsInOrder.length; i++) {
    await getDb().orm.public.Lesson.where({ id: idsInOrder[i] }).update({ position: i + 1 });
  }
}

export async function getModuleById(id: string): Promise<Module | null> {
  return loadModuleWithLessons(id);
}

/** A lesson with the module it belongs to (the domain Lesson has no moduleId). */
export async function getLessonById(id: string): Promise<(Lesson & { moduleId: string }) | null> {
  const row = await getDb().orm.public.Lesson.where({ id }).first();
  if (!row) return null;
  return { ...mapLessonRow(row), moduleId: row.moduleId };
}

/** Create a module at the end of the course (next free position). */
export async function createModule(courseId: string, input: { title: string }): Promise<Module> {
  const siblings = await moduleSiblings(courseId);
  const row = await getDb().orm.public.Module.create({
    courseId,
    title: input.title,
    position: siblings.length + 1,
  });
  return mapModuleRow(row, []);
}

export interface UpdateModuleInput {
  title?: string;
  position?: number;
}

export async function updateModule(id: string, input: UpdateModuleInput): Promise<Module | null> {
  const current = await getDb().orm.public.Module.where({ id }).first();
  if (!current) return null;
  if (input.title !== undefined) {
    await getDb().orm.public.Module.where({ id }).update({ title: input.title });
  }
  if (input.position !== undefined) {
    const siblings = await moduleSiblings(current.courseId);
    const ids = siblings.map((m) => m.id).filter((mid) => mid !== id);
    const target = Math.max(1, Math.min(Math.floor(input.position), ids.length + 1));
    ids.splice(target - 1, 0, id);
    await applyModuleOrder(ids);
  }
  return loadModuleWithLessons(id);
}

/**
 * Delete a module. Its lessons go with it (the contract cascades via FK;
 * the lessons are also deleted explicitly here because the in-memory test
 * fake has no cascade). Remaining modules are reindexed contiguously.
 */
export async function deleteModule(id: string): Promise<boolean> {
  const current = await getDb().orm.public.Module.where({ id }).first();
  if (!current) return false;
  await getDb().orm.public.Lesson.where({ moduleId: id }).deleteAll();
  const deleted = await getDb().orm.public.Module.where({ id }).delete();
  if (!deleted) return false;
  const remaining = await moduleSiblings(current.courseId);
  for (const m of remaining) {
    if (m.position > current.position) {
      await getDb().orm.public.Module.where({ id: m.id }).update({ position: m.position - 1 });
    }
  }
  return true;
}

export interface CreateLessonInput {
  title: string;
  description?: string;
  recordingUrl?: string;
  materials?: { name: string; url: string }[];
  duration?: string;
  date?: string;
}

/** Create a lesson at the end of the module (next free position). */
export async function createLesson(moduleId: string, input: CreateLessonInput): Promise<Lesson> {
  const siblings = await lessonSiblings(moduleId);
  const row = await getDb().orm.public.Lesson.create({
    moduleId,
    title: input.title,
    position: siblings.length + 1,
    description: input.description ?? null,
    recordingUrl: input.recordingUrl ?? null,
    materials: input.materials ?? [],
    duration: input.duration ?? null,
    date: stringToDate(input.date),
  });
  return mapLessonRow(row);
}

export interface UpdateLessonInput {
  title?: string;
  description?: string | null;
  recordingUrl?: string | null;
  materials?: { name: string; url: string }[];
  duration?: string | null;
  date?: string | null;
  position?: number;
}

export async function updateLesson(id: string, input: UpdateLessonInput): Promise<Lesson | null> {
  const current = await getDb().orm.public.Lesson.where({ id }).first();
  if (!current) return null;
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.recordingUrl !== undefined) data.recordingUrl = input.recordingUrl;
  if (input.materials !== undefined) data.materials = input.materials;
  if (input.duration !== undefined) data.duration = input.duration;
  if (input.date !== undefined) data.date = stringToDate(input.date);
  if (Object.keys(data).length > 0) {
    await getDb().orm.public.Lesson.where({ id }).update(stripUndefined(data));
  }
  if (input.position !== undefined) {
    const siblings = await lessonSiblings(current.moduleId);
    const ids = siblings.map((l) => l.id).filter((lid) => lid !== id);
    const target = Math.max(1, Math.min(Math.floor(input.position), ids.length + 1));
    ids.splice(target - 1, 0, id);
    await applyLessonOrder(ids);
  }
  const updated = await getLessonById(id);
  if (!updated) return null;
  const { moduleId: _moduleId, ...lesson } = updated;
  void _moduleId;
  return lesson;
}

/** Delete a lesson and reindex the remaining lessons in its module. */
export async function deleteLesson(id: string): Promise<boolean> {
  const current = await getDb().orm.public.Lesson.where({ id }).first();
  if (!current) return false;
  const deleted = await getDb().orm.public.Lesson.where({ id }).delete();
  if (!deleted) return false;
  const remaining = await lessonSiblings(current.moduleId);
  for (const l of remaining) {
    if (l.position > current.position) {
      await getDb().orm.public.Lesson.where({ id: l.id }).update({ position: l.position - 1 });
    }
  }
  return true;
}
