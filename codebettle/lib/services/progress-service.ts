/**
 * Student progress tracking — pure helpers (no DB, no I/O).
 *
 * Progress % per course = completed lessons / total lessons in that
 * course (0% when nothing is done, 100% when every lesson is complete).
 * The next lesson is the first incomplete lesson in curriculum order
 * (modules and lessons arrive from the DB ordered by position, so the
 * array order IS the curriculum order — see lib/db/courses.ts).
 *
 * These helpers are shared by the server pages (student dashboard,
 * course detail) and the student course client component, so the %
 * and the next lesson agree everywhere.
 */

/** Minimal shape of a lesson for progress math (structural — both the DB Module/Lesson types and the public course shape satisfy it). */
export interface ProgressLessonInput {
  id: string;
  title: string;
}

/** Minimal shape of a module for progress math. */
export interface ProgressModuleInput {
  id: string;
  title: string;
  lessons: ProgressLessonInput[];
}

/** One lesson flattened out of the module tree, in curriculum order. */
export interface FlatLesson {
  moduleId: string;
  moduleTitle: string;
  lessonId: string;
  lessonTitle: string;
}

/** The next lesson a student should do, or null when the course is complete. */
export type NextLesson = FlatLesson | null;

/**
 * Progress % for a course (0–100, rounded to the nearest whole number).
 * 0 when the course has no lessons at all — there is nothing to complete.
 * Completed ids that do not belong to the course are ignored by the
 * caller (pass the count of completed lessons that ARE in the course).
 */
export function courseProgressPercent(totalLessons: number, completedCount: number): number {
  if (totalLessons <= 0) return 0;
  const clamped = Math.min(Math.max(completedCount, 0), totalLessons);
  return Math.round((clamped / totalLessons) * 100);
}

/** All lessons of a course flattened into curriculum order. */
export function flattenLessons(modules: ProgressModuleInput[]): FlatLesson[] {
  const out: FlatLesson[] = [];
  for (const mod of modules) {
    for (const lesson of mod.lessons) {
      out.push({ moduleId: mod.id, moduleTitle: mod.title, lessonId: lesson.id, lessonTitle: lesson.title });
    }
  }
  return out;
}

/**
 * The next lesson: the first lesson (in curriculum order) whose id is
 * not in the completed set. Null when every lesson is complete (or the
 * course has no lessons).
 */
export function findNextLesson(
  modules: ProgressModuleInput[],
  completedLessonIds: ReadonlySet<string> | readonly string[],
): NextLesson {
  const completed = completedLessonIds instanceof Set ? completedLessonIds : new Set(completedLessonIds);
  for (const lesson of flattenLessons(modules)) {
    if (!completed.has(lesson.lessonId)) return lesson;
  }
  return null;
}

/** Full progress summary for one enrolment in one course. */
export interface CourseProgressSummary {
  totalLessons: number;
  completedCount: number;
  percent: number;
  nextLesson: NextLesson;
  isComplete: boolean;
}

export function summarizeCourseProgress(
  modules: ProgressModuleInput[],
  completedLessonIds: ReadonlySet<string> | readonly string[],
): CourseProgressSummary {
  const flat = flattenLessons(modules);
  const completed = completedLessonIds instanceof Set ? completedLessonIds : new Set(completedLessonIds);
  const completedCount = flat.filter((l) => completed.has(l.lessonId)).length;
  const percent = courseProgressPercent(flat.length, completedCount);
  return {
    totalLessons: flat.length,
    completedCount,
    percent,
    nextLesson: percent >= 100 ? null : findNextLesson(modules, completed),
    isComplete: flat.length > 0 && completedCount >= flat.length,
  };
}
