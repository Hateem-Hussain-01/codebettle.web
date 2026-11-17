// Mac-window design (Eman, 17 Nov 2026 — APPROVED with one change).
//
// The Home page hero + stats + featured courses sit inside ONE
// browser-window frame (address bar codebettle.com, NO dots), and
// each featured course card is a mini code-editor window (3 dots +
// filename, exactly as the approved preview). The dots are
// decorative only — no click handlers anywhere.
//
// These tests verify the wiring at the source level (like the other
// design tests); they do not render pixels — visual verification
// against the rendered home page is in the PR body.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { courseEditorFilename } from '../lib/course-filename';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

// ---------------------------------------------------------------- filename mapping

test('courseEditorFilename: the preview filenames match exactly', () => {
  // Preview card 1 — Python Crash Course.
  assert.equal(
    courseEditorFilename({
      slug: 'python-machine-learning',
      title: 'Python Crash Course',
      category: 'Data Science',
      tags: ['Python', 'ML', 'Data Science', 'TensorFlow'],
    }),
    'python.py',
  );
  // Preview card 2 — DevOps Bootcamp.
  assert.equal(
    courseEditorFilename({
      slug: 'docker-kubernetes-devops',
      title: 'Docker & Kubernetes for DevOps',
      category: 'DevOps',
      tags: ['Docker', 'Kubernetes', 'DevOps', 'CI/CD'],
    }),
    'devops.yaml',
  );
  // Preview card 3 — Machine Learning (no Python in it).
  assert.equal(
    courseEditorFilename({
      slug: 'machine-learning-fundamentals',
      title: 'Machine Learning Fundamentals',
      category: 'Data Science',
      tags: ['ML', 'TensorFlow'],
    }),
    'model.ipynb',
  );
});

test('courseEditorFilename: every real course gets a filename that matches its subject', () => {
  const cases: Array<[Parameters<typeof courseEditorFilename>[0], string]> = [
    [
      {
        slug: 'complete-react-nextjs-course',
        title: 'Complete React & Next.js Mastery',
        category: 'Web Development',
        tags: ['React', 'Next.js', 'TypeScript', 'Web Dev'],
      },
      'App.jsx',
    ],
    [
      {
        slug: 'flutter-mobile-development',
        title: 'Flutter Mobile App Development',
        category: 'Mobile Development',
        tags: ['Flutter', 'Dart', 'Mobile', 'Firebase'],
      },
      'main.dart',
    ],
    [
      {
        slug: 'ui-ux-design-figma',
        title: 'UI/UX Design with Figma',
        category: 'UI/UX Design',
        tags: ['Figma', 'UI/UX', 'Design', 'Prototyping'],
      },
      'design.fig',
    ],
    [
      {
        slug: 'nodejs-backend',
        title: 'Node.js Backend Development',
        category: 'Programming',
        tags: ['Node.js', 'Express'],
      },
      'server.js',
    ],
    [
      {
        slug: 'react-native-apps',
        title: 'React Native Mobile Apps',
        category: 'Mobile Development',
        tags: ['React Native'],
      },
      'App.tsx',
    ],
    [
      {
        slug: 'sql-databases',
        title: 'SQL & Databases',
        category: 'Programming',
        tags: ['SQL', 'PostgreSQL'],
      },
      'queries.sql',
    ],
    [
      {
        slug: 'docker-containers',
        title: 'Docker Containers',
        category: 'Programming',
        tags: ['Docker'],
      },
      'Dockerfile',
    ],
  ];
  for (const [course, expected] of cases) {
    assert.equal(courseEditorFilename(course), expected, `${course.title} → ${expected}`);
  }
});

test('courseEditorFilename: priority order — python beats ML, react-native beats react, devops beats docker', () => {
  // "Python … Machine Learning" is python.py, not model.ipynb.
  assert.equal(
    courseEditorFilename({
      slug: 'python-machine-learning',
      title: 'Python for Data Science & Machine Learning',
      category: 'Data Science',
      tags: ['Python', 'ML'],
    }),
    'python.py',
  );
  // "React Native" is App.tsx, not App.jsx.
  assert.equal(
    courseEditorFilename({
      slug: 'react-native-apps',
      title: 'React Native Mobile Apps',
      category: 'Mobile Development',
      tags: ['React Native', 'React'],
    }),
    'App.tsx',
  );
  // A DevOps course that also teaches Docker is devops.yaml.
  assert.equal(
    courseEditorFilename({
      slug: 'docker-kubernetes-devops',
      title: 'Docker & Kubernetes for DevOps',
      category: 'DevOps',
      tags: ['Docker'],
    }),
    'devops.yaml',
  );
});

test('courseEditorFilename: "ml" inside "html" does not count, and unknown subjects fall back to main.js', () => {
  assert.equal(
    courseEditorFilename({
      slug: 'html-css-basics',
      title: 'HTML & CSS Basics',
      category: 'Web Development',
      tags: ['HTML', 'CSS'],
    }),
    'main.js',
  );
  assert.equal(
    courseEditorFilename({
      slug: 'advanced-excel',
      title: 'Advanced Excel',
      category: 'Programming',
      tags: ['Excel'],
    }),
    'main.js',
  );
});

// ---------------------------------------------------------------- section window

test('MacWindow: address bar with codebettle.com, NO dots, clears the fixed navbar', () => {
  const win = read('components/ui/MacWindow.tsx');
  assert.ok(win.includes('codebettle.com'), 'address bar must show codebettle.com');
  // Eman's change: the section window loses its 3 dots.
  assert.ok(!win.includes('ff5f57'), 'no red dot in the section window');
  assert.ok(!win.includes('febc2e'), 'no yellow dot in the section window');
  assert.ok(!win.includes('28c840'), 'no green dot in the section window');
  assert.ok(!win.includes('onClick'), 'nothing in the window top bar is clickable');
  // The global fixed navbar (h-16) sits above the window — the frame
  // must start below it, not underneath it.
  assert.ok(win.includes('pt-16'), 'window must clear the fixed navbar');
  // Rounded dark frame that clips the hero scene and sections.
  assert.ok(win.includes('rounded-3xl'), 'frame must be rounded');
  assert.ok(win.includes('overflow-hidden'), 'frame must clip its content to the rounded corners');
  assert.ok(win.includes('{children}'), 'window must render its children');
});

test('home page: hero + stats + featured courses are inside ONE MacWindow, navbar stays outside', () => {
  const page = read('app/page.tsx');
  const navbarAt = page.indexOf('<Navbar');
  const openAt = page.indexOf('<MacWindow>');
  const closeAt = page.indexOf('</MacWindow>');
  const heroAt = page.indexOf('<HeroSection');
  const statsAt = page.indexOf('<StatsSection');
  const coursesAt = page.indexOf('<FeaturedCourses');
  const reviewsAt = page.indexOf('<ReviewsCarousel');
  assert.ok(navbarAt >= 0 && openAt > navbarAt, 'navbar must stay outside/above the window');
  assert.ok(openAt >= 0 && closeAt > openAt, 'MacWindow must wrap a block');
  assert.ok(heroAt > openAt && heroAt < closeAt, 'hero must be inside the window');
  assert.ok(statsAt > heroAt && statsAt < closeAt, 'stats must stay between hero and courses, inside the window');
  assert.ok(coursesAt > statsAt && coursesAt < closeAt, 'featured courses must be inside the window');
  assert.ok(reviewsAt > closeAt, 'everything below the window must stay outside it');
});

// ---------------------------------------------------------------- course-card editor header

test('CourseCard: editor header renders 3 dots + filename only when editorFileName is passed, never clickable', () => {
  const card = read('components/ui/CourseCard.tsx');
  assert.ok(card.includes('editorFileName?: string'), 'CourseCard must accept an optional editorFileName');
  assert.ok(card.includes('{editorFileName && ('), 'header must render only when a filename is passed');
  // The three macOS traffic-light dots, exactly as the preview.
  assert.ok(card.includes('bg-[#ff5f57]'), 'red dot must be #ff5f57');
  assert.ok(card.includes('bg-[#febc2e]'), 'yellow dot must be #febc2e');
  assert.ok(card.includes('bg-[#28c840]'), 'green dot must be #28c840');
  assert.ok(card.includes('{editorFileName}'), 'filename must render in the header');
  // Decorative only: the header block carries no click handler.
  const headerStart = card.indexOf('{editorFileName && (');
  const thumbAt = card.indexOf('{/* Thumbnail */}');
  assert.ok(headerStart >= 0 && thumbAt > headerStart, 'header must sit above the thumbnail');
  const headerBlock = card.slice(headerStart, thumbAt);
  assert.ok(!headerBlock.includes('onClick'), 'dots must have no click handler');
  assert.ok(!headerBlock.includes('×') && !headerBlock.includes('−'), 'dots must show no hover symbols');
  assert.ok(headerBlock.includes('aria-hidden'), 'decorative dots must be hidden from assistive tech');
});

test('featured courses pass the editor filename; /courses and the wishlist do not', () => {
  const featured = read('components/sections/featured-courses-client.tsx');
  assert.ok(
    featured.includes('editorFileName={courseEditorFilename(course)}'),
    'featured cards must pass the derived filename',
  );
  assert.ok(featured.includes("from '@/lib/course-filename'"), 'featured client must import the mapping');
  // The shared card keeps its plain look everywhere else.
  const courses = read('app/courses/courses-client.tsx');
  assert.ok(!courses.includes('editorFileName'), '/courses page must not gain the editor header');
  const wishlist = read('app/student/wishlist/student-wishlist-client.tsx');
  assert.ok(!wishlist.includes('editorFileName'), 'student wishlist must not gain the editor header');
});

test('hero code window keeps its 3 dots (untouched by this PR)', () => {
  const hero = read('components/sections/HeroSection.tsx');
  assert.ok(hero.includes('hello.py'), 'hero code window must stay');
  assert.ok(hero.includes('bg-primary'), 'hero window keeps its gold dots');
});
