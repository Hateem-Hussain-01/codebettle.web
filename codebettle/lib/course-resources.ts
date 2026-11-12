import type { PublicCourse } from '@/lib/db/types';

/**
 * Per-course Resources — pure helpers (no fetch, no DB).
 *
 * The Resources section on /student/courses/[id] reuses the already-fetched
 * gated content (GET /api/student/courses/[id]/content): the student-course
 * content component hands the lesson materials to CourseResources, which
 * collects them into one list grouped by module, then lesson. The gating
 * itself lives in the component: a pending-payment enrolment never sees
 * material names or URLs here, even though the endpoint returns the first
 * 2 lessons' materials for the lesson list.
 */

export type CourseResourceKind = 'pdf' | 'presentation' | 'other';

export interface CourseResource {
  name: string;
  url: string;
}

/** Minimal shape of a gated lesson — what the content endpoint returns. */
export interface GatedLessonMaterials {
  lessonId: string;
  materials: CourseResource[];
}

export interface GroupedLessonResources {
  lessonId: string;
  lessonTitle: string;
  materials: CourseResource[];
}

export interface GroupedModuleResources {
  moduleId: string;
  moduleTitle: string;
  lessons: GroupedLessonResources[];
}

const PRESENTATION_EXTENSIONS = new Set(['ppt', 'pptx', 'pps', 'ppsx', 'odp', 'key']);

/** File extension of a name or URL, lowercased, without query/hash — '' when none. */
export function resourceExtension(name: string, url: string): string {
  for (const value of [name, url]) {
    const clean = value.split(/[?#]/, 1)[0].trim();
    const dot = clean.lastIndexOf('.');
    // A dot only counts when it follows the last slash (i.e. it is in the
    // file name, not in a domain like drive.google.com).
    if (dot > clean.lastIndexOf('/')) {
      const ext = clean.slice(dot + 1).toLowerCase();
      if (ext) return ext;
    }
  }
  return '';
}

/** PDF / PPT / other, detected from the file name first, then the URL. */
export function resourceFileKind(name: string, url: string): CourseResourceKind {
  const ext = resourceExtension(name, url);
  if (ext === 'pdf') return 'pdf';
  if (PRESENTATION_EXTENSIONS.has(ext)) return 'presentation';
  return 'other';
}

/**
 * Collect every material from every lesson into one list, grouped by
 * module, then lesson, in curriculum order. Lessons and modules with no
 * materials are skipped; lessons the endpoint did not return are skipped.
 */
export function collectCourseResources(
  modules: PublicCourse['modules'],
  lessons: GatedLessonMaterials[],
): GroupedModuleResources[] {
  const byLesson = new Map(lessons.map((l) => [l.lessonId, l.materials ?? []]));
  const groups: GroupedModuleResources[] = [];
  for (const mod of modules) {
    const moduleLessons: GroupedLessonResources[] = [];
    for (const lesson of mod.lessons) {
      const materials = byLesson.get(lesson.id) ?? [];
      if (materials.length > 0) {
        moduleLessons.push({ lessonId: lesson.id, lessonTitle: lesson.title, materials });
      }
    }
    if (moduleLessons.length > 0) {
      groups.push({ moduleId: mod.id, moduleTitle: mod.title, lessons: moduleLessons });
    }
  }
  return groups;
}

/** Total material count across all groups. */
export function countCourseResources(groups: GroupedModuleResources[]): number {
  return groups.reduce(
    (total, group) => total + group.lessons.reduce((n, lesson) => n + lesson.materials.length, 0),
    0,
  );
}
