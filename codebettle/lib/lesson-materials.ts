// Per-lesson resources (teacher side) — pure helpers for the instructor
// curriculum editor.
//
// A "material" is a name + URL link (e.g. a PDF/PPT shared on Google
// Drive). There is NO file-upload flow and NO storage bucket: the teacher
// pastes a link and the student side shows it. The lesson APIs already
// accept `materials` (lessonCreateSchema / lessonUpdateSchema in
// lib/api-schemas.ts), so these helpers only shape the client-side editor
// state and the PATCH/POST payloads.
//
// Rules (mirrored by tests/course-resources-teacher.test.ts):
// - A row with BOTH fields blank is an untouched row: dropped silently,
//   never saved, never an error.
// - A row with exactly one field filled is incomplete: saving is blocked
//   with a clear error naming the lesson.
// - A complete row's URL must start with http:// or https://.
// - The save diff only sends `materials` when the sanitised list changed.
export interface LessonMaterial {
  name: string;
  url: string;
}

/** One blank editor row. */
export function emptyMaterial(): LessonMaterial {
  return { name: '', url: '' };
}

/** Append a blank row to the lesson's materials. */
export function addMaterialRow(materials: LessonMaterial[]): LessonMaterial[] {
  return [...(materials ?? []), emptyMaterial()];
}

/** Update one field of one row (returns a new array; out-of-range index is a no-op). */
export function updateMaterialRow(
  materials: LessonMaterial[],
  index: number,
  field: 'name' | 'url',
  value: string,
): LessonMaterial[] {
  const list = materials ?? [];
  if (index < 0 || index >= list.length) return list;
  return list.map((m, i) => (i === index ? { ...m, [field]: value } : m));
}

/** Remove one row (returns a new array; out-of-range index is a no-op). */
export function removeMaterialRow(materials: LessonMaterial[], index: number): LessonMaterial[] {
  const list = materials ?? [];
  if (index < 0 || index >= list.length) return list;
  return list.filter((_, i) => i !== index);
}

/** A URL is usable as a resource link when it starts with http:// or https://. */
export function isValidMaterialUrl(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

/**
 * Drop fully-empty rows and trim the rest. Incomplete rows are kept here
 * (so the caller can report them); use validateMaterials() to reject them.
 */
export function sanitizeMaterials(materials: LessonMaterial[]): LessonMaterial[] {
  return (materials ?? [])
    .map(m => ({ name: m.name.trim(), url: m.url.trim() }))
    .filter(m => m.name !== '' || m.url !== '');
}

/**
 * Validate a lesson's materials for saving. Returns an error message for
 * the first bad row, or null when everything is saveable. Fully-empty rows
 * are ignored (the teacher added a row and left it blank). `lessonTitle`
 * is included in the message so the toast says which class is affected.
 */
export function validateMaterials(materials: LessonMaterial[], lessonTitle: string): string | null {
  const rows = sanitizeMaterials(materials);
  for (const row of rows) {
    if (!row.name) return `Resource in "${lessonTitle}" needs a name`;
    if (!row.url) return `Resource "${row.name}" in "${lessonTitle}" needs a link`;
    if (!isValidMaterialUrl(row.url)) return `Resource "${row.name}" in "${lessonTitle}" needs a link starting with http:// or https://`;
  }
  return null;
}

/** Order-sensitive comparison of the sanitised material lists. */
export function materialsEqual(a: LessonMaterial[], b: LessonMaterial[]): boolean {
  return JSON.stringify(sanitizeMaterials(a)) === JSON.stringify(sanitizeMaterials(b));
}

/**
 * The `materials` fragment for a lesson PATCH: `{ materials }` when the
 * sanitised list changed since the last server-confirmed save, otherwise
 * `{}` so the field is omitted from the payload entirely.
 */
export function materialsPatchFragment(
  current: LessonMaterial[],
  saved: LessonMaterial[],
): { materials: LessonMaterial[] } | Record<string, never> {
  if (materialsEqual(current, saved)) return {};
  return { materials: sanitizeMaterials(current) };
}
