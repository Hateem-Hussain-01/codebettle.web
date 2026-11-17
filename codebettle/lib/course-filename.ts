/**
 * Editor filename for a featured course card (Eman, 17 Nov 2026 —
 * Mac-window design). Each featured course card on the Home page is
 * a mini code-editor window: 3 dots + a filename in its header bar,
 * exactly as the approved preview (python.py, devops.yaml,
 * model.ipynb). The filename is derived from the course's own
 * subject (slug, title, category, tags) — never hard-coded per
 * course id, so a renamed course or a newly featured course still
 * gets a filename that matches what it teaches.
 *
 * Priority order matters: "python" wins over "machine learning"
 * (the Python Crash Course teaches ML too, but the preview calls it
 * python.py), "react native" wins over "react", and "devops" wins
 * over "docker" (the DevOps course is devops.yaml in the preview).
 */
export interface CourseFilenameInput {
  slug: string;
  title: string;
  category: string;
  tags: string[];
}

export function courseEditorFilename(course: CourseFilenameInput): string {
  const haystack = [course.slug, course.title, course.category, ...(course.tags ?? [])]
    .join(' ')
    .toLowerCase();

  if (haystack.includes('python')) return 'python.py';
  if (haystack.includes('devops')) return 'devops.yaml';
  if (haystack.includes('machine learning') || /\bml\b/.test(haystack)) return 'model.ipynb';
  if (haystack.includes('react native')) return 'App.tsx';
  if (haystack.includes('react') || haystack.includes('next')) return 'App.jsx';
  if (haystack.includes('flutter') || haystack.includes('dart')) return 'main.dart';
  if (haystack.includes('figma') || haystack.includes('ui/ux') || haystack.includes('ui_ux')) {
    return 'design.fig';
  }
  if (haystack.includes('docker') || haystack.includes('kubernetes')) return 'Dockerfile';
  if (haystack.includes('node')) return 'server.js';
  if (haystack.includes('sql') || haystack.includes('database')) return 'queries.sql';
  return 'main.js';
}
