/**
 * Course management service (Phase 3).
 *
 * The logic behind /api/admin/courses/* and /api/instructor/courses/*.
 * No Next.js imports — unit-testable with the fake db. Every mutation
 * writes an audit entry.
 *
 * Ownership (lib/rbac.ts): an admin may touch any course; an instructor
 * may touch ONLY courses they teach; students get 403 on everything here.
 * Instructors may never change a course's status or instructorId — those
 * are admin-only (publishCourse capability).
 */
import {
  createCourse,
  createLesson,
  createModule,
  deleteLesson,
  deleteModule,
  getCourseById,
  getCourseBySlug,
  softDeleteCourse,
  updateCourse,
  updateLesson,
  updateModule,
} from '../db/courses';
import { getUserById } from '../db/users';
import { logAudit } from '../db/audit';
import { can, hasAdminCapability, hasTeacherCapability } from '../rbac';
import type { Course, CourseCategory, CourseLevel, CourseSchedule, CourseStatus, Lesson, Module } from '../db/types';
import { badRequest, forbidden, notFound, type Actor, type ServiceError } from './errors';

type Result<T> = T | ServiceError;

function isEditor(actor: Actor, course: Course): ServiceError | null {
  // Phase 2: admin capability is the isAdmin flag; teacher capability
  // the isTeacher flag (both fall back to the legacy primary role).
  if (hasAdminCapability(actor)) return null;
  if (hasTeacherCapability(actor) && course.instructorId === actor.id) return null;
  return forbidden(
    hasTeacherCapability(actor)
      ? 'You can only edit courses you teach'
      : 'Students cannot edit courses',
  );
}

/** A teacher who is NOT also an admin: admin capability wins when both flags are set. */
function isTeacherOnly(actor: Actor): boolean {
  return hasTeacherCapability(actor) && !hasAdminCapability(actor);
}

async function loadCourse(courseId: string): Promise<Course | ServiceError> {
  const course = await getCourseById(courseId);
  if (!course) return notFound('Course');
  return course;
}

async function checkInstructorTarget(instructorId: string): Promise<ServiceError | null> {
  const user = await getUserById(instructorId);
  if (!user) return notFound('Instructor');
  // Phase 2: anyone with the teacher capability (flag or legacy role).
  if (!hasTeacherCapability(user)) return badRequest('The assigned instructor must be an instructor account');
  return null;
}

export interface CreateCourseServiceInput {
  slug: string;
  title: string;
  description: string;
  longDescription: string;
  thumbnail: string;
  category: CourseCategory;
  level: CourseLevel;
  price: number;
  isFree?: boolean;
  instructorId?: string;
  zoomLink?: string;
  schedule?: CourseSchedule | null;
  requirements?: string[];
  whatYouLearn?: string[];
  tags?: string[];
  /** Optional full HTML certificate template for this course. */
  certificateTemplateHtml?: string;
  /** Optional public course outline PDF URL. */
  outlineUrl?: string;
}

export async function createCourseService(
  actor: Actor,
  input: CreateCourseServiceInput,
): Promise<Result<{ course: Course }>> {
  if (!can(actor, 'createCourse')) return forbidden('Only admins and instructors can create courses');
  const slug = input.slug.trim();
  if (!slug) return badRequest('Slug is required');
  if (!input.title.trim()) return badRequest('Title is required');
  if (!input.description.trim()) return badRequest('Description is required');
  if (!Number.isInteger(input.price) || input.price < 0) return badRequest('Price must be a non-negative number');
  const instructorId = isTeacherOnly(actor) ? actor.id : input.instructorId;
  if (!instructorId) return badRequest('Instructor is required');
  if (isTeacherOnly(actor) && input.instructorId !== undefined && input.instructorId !== actor.id) {
    return forbidden('Instructors can only create courses for themselves');
  }
  if (hasAdminCapability(actor)) {
    const err = await checkInstructorTarget(instructorId);
    if (err) return err;
  }
  if (await getCourseBySlug(slug)) return badRequest('A course with this slug already exists');
  const course = await createCourse({
    slug,
    title: input.title,
    description: input.description,
    longDescription: input.longDescription,
    thumbnail: input.thumbnail,
    category: input.category,
    level: input.level,
    pricePkr: input.price,
    isFree: input.isFree ?? input.price === 0,
    instructorId,
    zoomLink: input.zoomLink,
    schedule: input.schedule ?? null,
    requirements: input.requirements,
    whatYouLearn: input.whatYouLearn,
    tags: input.tags,
    certificateTemplateHtml: input.certificateTemplateHtml ?? null,
    outlineUrl: input.outlineUrl ?? null,
  });
  await logAudit({ actorId: actor.id, action: 'course.create', entity: 'course', entityId: course.id, detail: slug });
  return { course };
}

export interface UpdateCourseServiceInput {
  title?: string;
  description?: string;
  longDescription?: string;
  thumbnail?: string;
  category?: CourseCategory;
  level?: CourseLevel;
  price?: number;
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
  /** Full HTML certificate template for this course; null clears an attached template. */
  certificateTemplateHtml?: string | null;
  /** Public course outline PDF URL; null clears an attached outline. */
  outlineUrl?: string | null;
}

export async function updateCourseService(
  actor: Actor,
  courseId: string,
  input: UpdateCourseServiceInput,
): Promise<Result<{ course: Course }>> {
  const course = await loadCourse(courseId);
  if ('error' in course) return course;
  const denied = isEditor(actor, course);
  if (denied) return denied;
  if (isTeacherOnly(actor) && (input.status !== undefined || input.instructorId !== undefined)) {
    return forbidden('Instructors cannot change a course status or instructor');
  }
  if (input.title !== undefined && !input.title.trim()) return badRequest('Title is required');
  if (input.price !== undefined && (!Number.isInteger(input.price) || input.price < 0)) {
    return badRequest('Price must be a non-negative number');
  }
  if (input.instructorId !== undefined) {
    const err = await checkInstructorTarget(input.instructorId);
    if (err) return err;
  }
  const updated = await updateCourse(courseId, {
    title: input.title,
    description: input.description,
    longDescription: input.longDescription,
    thumbnail: input.thumbnail,
    category: input.category,
    level: input.level,
    pricePkr: input.price,
    isFree: input.isFree,
    instructorId: input.instructorId,
    zoomLink: input.zoomLink,
    schedule: input.schedule,
    status: input.status,
    isFeatured: input.isFeatured,
    isCompleted: input.isCompleted,
    requirements: input.requirements,
    whatYouLearn: input.whatYouLearn,
    tags: input.tags,
    certificateTemplateHtml: input.certificateTemplateHtml,
    outlineUrl: input.outlineUrl,
  });
  if (!updated) return notFound('Course');
  await logAudit({ actorId: actor.id, action: 'course.update', entity: 'course', entityId: courseId });
  return { course: updated };
}

/** Change a course's status (draft/published/archived). Admin-only per RBAC (publishCourse). */
export async function setCourseStatus(
  actor: Actor,
  courseId: string,
  status: CourseStatus,
): Promise<Result<{ course: Course }>> {
  if (!can(actor, 'publishCourse')) return forbidden('Only admins can change course status');
  const course = await loadCourse(courseId);
  if ('error' in course) return course;
  const updated = await updateCourse(courseId, { status });
  if (!updated) return notFound('Course');
  await logAudit({ actorId: actor.id, action: 'course.status', entity: 'course', entityId: courseId, detail: status });
  return { course: updated };
}

/** Soft-delete a course (admin only). Enrolments and certificates keep their references. */
export async function deleteCourseService(
  actor: Actor,
  courseId: string,
): Promise<Result<{ success: true }>> {
  if (!hasAdminCapability(actor)) return forbidden('Only admins can delete courses');
  const course = await loadCourse(courseId);
  if ('error' in course) return course;
  const removed = await softDeleteCourse(courseId);
  if (!removed) return notFound('Course');
  await logAudit({ actorId: actor.id, action: 'course.delete', entity: 'course', entityId: courseId, detail: course.slug });
  return { success: true };
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

function findModule(course: Course, moduleId: string): Module | ServiceError {
  const mod = course.modules.find((m) => m.id === moduleId);
  if (!mod) return notFound('Module');
  return mod;
}

export async function createModuleService(
  actor: Actor,
  courseId: string,
  input: { title: string },
): Promise<Result<{ module: Module }>> {
  const course = await loadCourse(courseId);
  if ('error' in course) return course;
  const denied = isEditor(actor, course);
  if (denied) return denied;
  if (!input.title.trim()) return badRequest('Title is required');
  const module = await createModule(courseId, { title: input.title });
  await logAudit({ actorId: actor.id, action: 'course.module.create', entity: 'module', entityId: module.id, detail: `${courseId} ${module.title}` });
  return { module };
}

export async function updateModuleService(
  actor: Actor,
  courseId: string,
  moduleId: string,
  input: { title?: string; position?: number },
): Promise<Result<{ module: Module }>> {
  const course = await loadCourse(courseId);
  if ('error' in course) return course;
  const denied = isEditor(actor, course);
  if (denied) return denied;
  const mod = findModule(course, moduleId);
  if ('error' in mod) return mod;
  if (input.title !== undefined && !input.title.trim()) return badRequest('Title is required');
  if (input.title === undefined && input.position === undefined) return badRequest('Nothing to update');
  const updated = await updateModule(moduleId, input);
  if (!updated) return notFound('Module');
  await logAudit({ actorId: actor.id, action: 'course.module.update', entity: 'module', entityId: moduleId });
  return { module: updated };
}

export async function deleteModuleService(
  actor: Actor,
  courseId: string,
  moduleId: string,
): Promise<Result<{ success: true }>> {
  const course = await loadCourse(courseId);
  if ('error' in course) return course;
  const denied = isEditor(actor, course);
  if (denied) return denied;
  const mod = findModule(course, moduleId);
  if ('error' in mod) return mod;
  const removed = await deleteModule(moduleId);
  if (!removed) return notFound('Module');
  await logAudit({ actorId: actor.id, action: 'course.module.delete', entity: 'module', entityId: moduleId });
  return { success: true };
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

function findLesson(course: Course, moduleId: string, lessonId: string): Lesson | ServiceError {
  const mod = course.modules.find((m) => m.id === moduleId);
  if (!mod) return notFound('Module');
  const lesson = mod.lessons.find((l) => l.id === lessonId);
  if (!lesson) return notFound('Lesson');
  return lesson;
}

export interface CreateLessonServiceInput {
  title: string;
  description?: string;
  recordingUrl?: string;
  materials?: { name: string; url: string }[];
  duration?: string;
  date?: string;
}

export async function createLessonService(
  actor: Actor,
  courseId: string,
  moduleId: string,
  input: CreateLessonServiceInput,
): Promise<Result<{ lesson: Lesson }>> {
  const course = await loadCourse(courseId);
  if ('error' in course) return course;
  const denied = isEditor(actor, course);
  if (denied) return denied;
  const mod = findModule(course, moduleId);
  if ('error' in mod) return mod;
  if (!input.title.trim()) return badRequest('Title is required');
  const lesson = await createLesson(moduleId, input);
  await logAudit({ actorId: actor.id, action: 'course.lesson.create', entity: 'lesson', entityId: lesson.id, detail: `${courseId}/${moduleId} ${lesson.title}` });
  return { lesson };
}

export interface UpdateLessonServiceInput {
  title?: string;
  description?: string | null;
  recordingUrl?: string | null;
  materials?: { name: string; url: string }[];
  duration?: string | null;
  date?: string | null;
  position?: number;
}

export async function updateLessonService(
  actor: Actor,
  courseId: string,
  moduleId: string,
  lessonId: string,
  input: UpdateLessonServiceInput,
): Promise<Result<{ lesson: Lesson }>> {
  const course = await loadCourse(courseId);
  if ('error' in course) return course;
  const denied = isEditor(actor, course);
  if (denied) return denied;
  const lesson = findLesson(course, moduleId, lessonId);
  if ('error' in lesson) return lesson;
  if (input.title !== undefined && !input.title.trim()) return badRequest('Title is required');
  if (Object.keys(input).length === 0) return badRequest('Nothing to update');
  const updated = await updateLesson(lessonId, input);
  if (!updated) return notFound('Lesson');
  await logAudit({ actorId: actor.id, action: 'course.lesson.update', entity: 'lesson', entityId: lessonId });
  return { lesson: updated };
}

export async function deleteLessonService(
  actor: Actor,
  courseId: string,
  moduleId: string,
  lessonId: string,
): Promise<Result<{ success: true }>> {
  const course = await loadCourse(courseId);
  if ('error' in course) return course;
  const denied = isEditor(actor, course);
  if (denied) return denied;
  const lesson = findLesson(course, moduleId, lessonId);
  if ('error' in lesson) return lesson;
  const removed = await deleteLesson(lessonId);
  if (!removed) return notFound('Lesson');
  await logAudit({ actorId: actor.id, action: 'course.lesson.delete', entity: 'lesson', entityId: lessonId });
  return { success: true };
}
