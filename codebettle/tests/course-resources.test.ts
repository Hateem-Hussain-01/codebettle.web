import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  collectCourseResources,
  countCourseResources,
  resourceFileKind,
  type GatedLessonMaterials,
} from '../lib/course-resources';
import type { PublicCourse } from '../lib/db/types';
import CourseResources from '../app/student/courses/[id]/course-resources';

/**
 * Per-course Resources (Worker A) — the Resources section inside each
 * /student/courses/[id] page. Pure grouping/detection is unit-tested
 * directly; the section itself is tested with renderToStaticMarkup
 * (same pattern as tests/public-forms.test.ts). The gated endpoint and
 * the per-lesson materials rendering are untouched — no API tests here.
 */

const lesson = (over: Partial<PublicCourse['modules'][number]['lessons'][number]> = {}) => ({
  id: 'l1',
  title: 'Lesson 1',
  description: '',
  date: '',
  driveRecordingUrl: '',
  materials: [],
  duration: '',
  ...over,
});

const modules: PublicCourse['modules'] = [
  {
    id: 'm1',
    title: 'Module One',
    lessons: [
      lesson({ id: 'l1', title: 'Intro' }),
      lesson({ id: 'l2', title: 'Basics' }),
      lesson({ id: 'l3', title: 'No materials here' }),
    ],
  },
  { id: 'm2', title: 'Module Two', lessons: [lesson({ id: 'l4', title: 'Advanced' })] },
  { id: 'm3', title: 'Empty Module', lessons: [lesson({ id: 'l5', title: 'Nothing shared' })] },
];

const gated: GatedLessonMaterials[] = [
  { lessonId: 'l1', materials: [{ name: 'Slides.pdf', url: 'https://drive.google.com/file/d/aaa/view' }] },
  { lessonId: 'l2', materials: [
    { name: 'Deck.pptx', url: 'https://example.com/deck.pptx' },
    { name: 'Cheat sheet', url: 'https://example.com/cheatsheet.pdf?download=1' },
  ] },
  { lessonId: 'l4', materials: [{ name: 'Project.zip', url: 'https://example.com/project.zip' }] },
  // Lesson the course does not have — must be ignored, never rendered.
  { lessonId: 'l-ghost', materials: [{ name: 'Ghost.pdf', url: 'https://example.com/ghost.pdf' }] },
];

function render(props: { modules?: PublicCourse['modules']; lessons?: GatedLessonMaterials[] | null; paymentPending?: boolean }): string {
  return renderToStaticMarkup(
    CourseResources({
      modules: props.modules ?? modules,
      lessons: props.lessons === undefined ? gated : props.lessons,
      paymentPending: props.paymentPending ?? false,
    }),
  );
}

// ---------------------------------------------------------------------------
// File-type detection
// ---------------------------------------------------------------------------

test('resourceFileKind: pdf from the name, or from the URL when the name has no extension', () => {
  assert.equal(resourceFileKind('Slides.pdf', 'https://drive.google.com/file/d/aaa/view'), 'pdf');
  assert.equal(resourceFileKind('Notes', 'https://example.com/notes.pdf'), 'pdf');
  assert.equal(resourceFileKind('Notes.PDF', 'https://example.com/x'), 'pdf');
  assert.equal(resourceFileKind('Cheat sheet', 'https://example.com/cheatsheet.pdf?download=1'), 'pdf');
  assert.equal(resourceFileKind('Cheat sheet', 'https://example.com/cheatsheet.pdf#page=2'), 'pdf');
});

test('resourceFileKind: ppt/pptx (and friends) are presentations, everything else is other', () => {
  assert.equal(resourceFileKind('Deck.pptx', 'https://example.com/x'), 'presentation');
  assert.equal(resourceFileKind('Deck.ppt', 'https://example.com/x'), 'presentation');
  assert.equal(resourceFileKind('Deck.PPTX', 'https://example.com/x'), 'presentation');
  assert.equal(resourceFileKind('Doc.docx', 'https://example.com/doc.docx'), 'other');
  assert.equal(resourceFileKind('Project.zip', 'https://example.com/project.zip'), 'other');
  // A dot in the domain (drive.google.com) is not a file extension.
  assert.equal(resourceFileKind('Slides', 'https://drive.google.com/file/d/aaa/view'), 'other');
  assert.equal(resourceFileKind('No extension at all', 'https://example.com/download'), 'other');
});

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

test('collectCourseResources: groups by module then lesson, in curriculum order, skipping empties', () => {
  const groups = collectCourseResources(modules, gated);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].moduleTitle, 'Module One');
  assert.equal(groups[0].lessons.length, 2);
  assert.equal(groups[0].lessons[0].lessonTitle, 'Intro');
  assert.equal(groups[0].lessons[0].materials.length, 1);
  assert.equal(groups[0].lessons[1].lessonTitle, 'Basics');
  assert.equal(groups[0].lessons[1].materials.length, 2);
  assert.equal(groups[1].moduleTitle, 'Module Two');
  assert.equal(groups[1].lessons[0].lessonTitle, 'Advanced');
  // Lessons/modules with no materials and unknown lesson ids never appear.
  assert.doesNotMatch(JSON.stringify(groups), /No materials here|Empty Module|Ghost/);
  assert.equal(countCourseResources(groups), 4);
});

test('collectCourseResources: empty input gives empty groups and a zero count', () => {
  assert.deepEqual(collectCourseResources(modules, []), []);
  assert.equal(countCourseResources(collectCourseResources(modules, [])), 0);
  assert.deepEqual(collectCourseResources([], gated), []);
});

// ---------------------------------------------------------------------------
// Rendering — verified enrolment
// ---------------------------------------------------------------------------

test('rendering: verified student sees every material grouped by module then lesson, with open links', () => {
  const html = render({});
  assert.match(html, /Resources/);
  assert.match(html, /4 files/);
  assert.match(html, /Module One/);
  assert.match(html, /Module Two/);
  assert.match(html, /Intro/);
  assert.match(html, /Basics/);
  assert.match(html, /Advanced/);
  for (const name of ['Slides.pdf', 'Deck.pptx', 'Cheat sheet', 'Project.zip']) {
    assert.match(html, new RegExp(name.replace('.', '\\.')));
  }
  assert.match(html, /href="https:\/\/drive\.google\.com\/file\/d\/aaa\/view"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  // One file-type icon per material row.
  assert.equal((html.match(/<svg/g) ?? []).length >= 4, true);
  assert.doesNotMatch(html, /Ghost/);
});

test('rendering: verified enrolment with zero materials shows the empty state', () => {
  const html = render({ lessons: [] });
  assert.match(html, /No resources shared yet/);
  assert.doesNotMatch(html, /Slides\.pdf|Deck\.pptx|Project\.zip/);
});

test('rendering: verified enrolment still loading the gated content shows a loading state, not an empty state', () => {
  const html = render({ lessons: null });
  assert.match(html, /Loading resources/);
  assert.doesNotMatch(html, /No resources shared yet/);
});

// ---------------------------------------------------------------------------
// Rendering — pending payment (strict gating)
// ---------------------------------------------------------------------------

test('rendering: pending-payment student sees a locked notice and NO material names or URLs', () => {
  const html = render({ paymentPending: true });
  assert.match(html, /Resources are locked/);
  assert.match(html, /Resources unlock once your payment is confirmed/);
  for (const leaked of ['Slides.pdf', 'Deck.pptx', 'Cheat sheet', 'Project.zip', 'drive.google.com', 'example.com/deck']) {
    assert.doesNotMatch(html, new RegExp(leaked.replace('.', '\\.')), `pending view must not leak: ${leaked}`);
  }
  // Even the lesson titles that carry materials must not appear here —
  // only the locked notice.
  assert.doesNotMatch(html, /Intro|Basics|Advanced/);
});

test('rendering: pending-payment student sees the locked notice even before the gated content loads', () => {
  const html = render({ paymentPending: true, lessons: null });
  assert.match(html, /Resources are locked/);
  assert.doesNotMatch(html, /Loading resources/);
});

// ---------------------------------------------------------------------------
// Wiring (source-level, same pattern as tests/phase6-design.test.ts)
// ---------------------------------------------------------------------------

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf-8');
}

test('wiring: student course content renders CourseResources below the lesson list, reusing the fetched content', () => {
  const page = read('app/student/courses/[id]/student-course-content.tsx');
  assert.match(page, /import CourseResources from '\.\/course-resources'/);
  assert.match(page, /<CourseResources modules=\{modules\} lessons=\{content\?\.lessons \?\? null\} paymentPending=\{paymentPending\} \/>/);
  // No second fetch for resources — the section reuses the gated content
  // (exactly one fetch of the content endpoint in this file).
  assert.equal((page.match(/fetch\(`\/api\/student\/courses\//g) ?? []).length, 1);
  const section = read('app/student/courses/[id]/course-resources.tsx');
  assert.doesNotMatch(section, /fetch\(/);
  assert.doesNotMatch(section, /\/api\//);
});

test('wiring: no "My Resources" aggregate page anywhere', () => {
  assert.equal(existsSync(new URL('../app/student/resources/page.tsx', import.meta.url)), false);
  assert.equal(existsSync(new URL('../app/student/my-resources/page.tsx', import.meta.url)), false);
  assert.doesNotMatch(read('app/student/courses/[id]/student-course-content.tsx'), /My Resources/);
});

test('wiring: public course payloads still strip materials (no materials added to any public payload)', () => {
  const mappers = read('lib/db/mappers.ts');
  assert.match(mappers, /materials: \[\]/);
  assert.doesNotMatch(read('app/student/courses/[id]/course-resources.tsx'), /toPublicCourse/);
});
