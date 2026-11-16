// Premium 3D public pages (Eman, 16 Nov 2026).
//
// Static design tests for the transformation of the four public
// pages (Home, About, Spotlight, Contact). They verify the wiring —
// the hero has no statistics, the lower statistics section is
// intact, the tilt math is correct, and the reduced-motion /
// pointer guards exist. They do not render pixels — visual
// verification against the rendered pages is in the PR body.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { computeTilt } from '../lib/tilt';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

// ---------------------------------------------------------------- hero stats

test('hero has NO statistics: the duplicate stats row is gone', () => {
  const hero = read('components/sections/HeroSection.tsx');
  // The removed block rendered this exact grid (numbers + labels).
  assert.ok(!hero.includes("['1,500+', 'Students']"), 'hero stats grid must be gone');
  assert.ok(!hero.includes("'8+', 'Courses'"), 'hero stats grid must be gone');
  assert.ok(!hero.includes("'5+', 'Instructors'"), 'hero stats grid must be gone');
  assert.ok(!hero.includes('{/* Stats */}'), 'hero stats comment must be gone');
  assert.ok(!hero.includes('grid-cols-3 gap-8 max-w-md'), 'hero stats layout must be gone');
  // The hero itself is intact: typewriter, copy, CTAs.
  assert.ok(hero.includes('Become a'), 'hero headline must stay');
  assert.ok(hero.includes('Explore Courses'), 'hero CTA must stay');
  assert.ok(hero.includes('TYPEWRITER_WORDS'), 'typewriter must stay');
});

test('hero is rebalanced after the stats removal: the code window is there', () => {
  const hero = read('components/sections/HeroSection.tsx');
  assert.ok(hero.includes('hello.py'), 'hero visual must be the Python code window');
  assert.ok(hero.includes('become_developer'), 'code window must show the snippet');
  assert.ok(hero.includes('Live interactive classes'), 'live-classes chip must exist');
  assert.ok(hero.includes('Verified certificates'), 'certificates chip must exist');
  assert.ok(hero.includes('TiltCard'), 'hero visual must tilt in 3D');
});

// ---------------------------------------------------------------- stats section

test('the separate statistics section below the hero is intact', () => {
  const stats = read('components/sections/StatsSection.tsx');
  // All four numbers + labels, exactly as before.
  assert.ok(stats.includes('value: 1500'), '1500+ Active Students must stay');
  assert.ok(stats.includes('value: 8'), '8+ Expert Courses must stay');
  assert.ok(stats.includes('value: 300'), '300+ Certificates Issued must stay');
  assert.ok(stats.includes('value: 4.8'), '4.8 Average Rating must stay');
  assert.ok(stats.includes('Active Students'), 'Active Students label must stay');
  assert.ok(stats.includes('Certificates Issued'), 'Certificates Issued label must stay');
  assert.ok(stats.includes('Average Rating'), 'Average Rating label must stay');
  assert.ok(stats.includes('function Counter'), 'animated counter must stay');
});

test('home page still renders the stats section right after the hero', () => {
  const page = read('app/page.tsx');
  const heroAt = page.indexOf('<HeroSection');
  const statsAt = page.indexOf('<StatsSection');
  assert.ok(heroAt >= 0 && statsAt >= 0, 'home must render both sections');
  assert.ok(statsAt > heroAt, 'StatsSection must come directly after HeroSection');
});

// ---------------------------------------------------------------- tilt math

test('computeTilt: centre is flat, corners lean toward the cursor, clamped', () => {
  const rect = { left: 100, top: 100, width: 200, height: 200 };
  assert.deepEqual(computeTilt(200, 200, rect, 6), { rotateX: 0, rotateY: 0 });
  // Top-left: top edge toward viewer (rotateX -6), left edge toward viewer (rotateY +6).
  assert.deepEqual(computeTilt(100, 100, rect, 6), { rotateX: -6, rotateY: 6 });
  // Bottom-right: opposite.
  assert.deepEqual(computeTilt(300, 300, rect, 6), { rotateX: 6, rotateY: -6 });
  // Outside the rect clamps to ±max.
  assert.deepEqual(computeTilt(1000, -500, rect, 6), { rotateX: -6, rotateY: -6 });
  // Degenerate rect never tilts.
  assert.deepEqual(computeTilt(200, 200, { left: 0, top: 0, width: 0, height: 0 }, 6), {
    rotateX: 0,
    rotateY: 0,
  });
});

// ---------------------------------------------------------------- guards

test('TiltCard is reduced-motion safe and touch-safe', () => {
  const tilt = read('components/ui/TiltCard.tsx');
  assert.ok(tilt.includes('useReducedMotion'), 'must respect reduced motion');
  assert.ok(tilt.includes('pointer: fine'), 'must only tilt for fine pointers');
  assert.ok(tilt.includes('perspective'), 'must render on a perspective stage');
  assert.ok(tilt.includes('useSpring'), 'tilt must settle with springs, not snap');
});

test('float animations are transform-only and covered by reduced-motion CSS', () => {
  const css = read('app/globals.css');
  assert.ok(css.includes('@keyframes float-y'), 'float keyframes must exist');
  assert.ok(css.includes('.animate-float-slow'), 'slow float class must exist');
  assert.ok(css.includes('transform: translateY'), 'float must be transform-only');
});

// ---------------------------------------------------------------- scope guard

test('dashboard files are untouched by this branch', () => {
  let changed: string[];
  try {
    changed = execSync('git diff --name-only origin/main...HEAD', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    // No git available (or not a git checkout) — the manual diff audit
    // in the PR body is the backstop; do not fail the suite here.
    return;
  }
  const dashboardPrefixes = [
    'codebettle/app/student/',
    'codebettle/app/admin/',
    'codebettle/app/instructor/',
    'codebettle/app/ambassador/',
    'codebettle/components/layout/PortalLayout.tsx',
  ];
  const offending = changed.filter((f) => dashboardPrefixes.some((p) => f.startsWith(p)));
  assert.deepEqual(offending, [], `dashboard files must not change: ${offending.join(', ')}`);
  // The stats section itself must not be in the diff either.
  assert.ok(
    !changed.includes('codebettle/components/sections/StatsSection.tsx'),
    'StatsSection.tsx must stay byte-identical',
  );
});

// ---------------------------------------------------------------- BlogPreview 500
// (16 Nov 2026 — landing page 500, digest 3155688011, the day PR #60
// merged): BlogPreview is an async SERVER component. PR #60 wrapped its
// cards in framer-motion's <motion.div> directly, and motion components
// are client-only — rendering one inside a server component throws
// during SSR and takes the whole page down. The flight stream proved
// it: every other home section rendered and BlogPreview was the error.
// The animation must live in a 'use client' wrapper (<FadeIn>, the
// pattern FeaturedCourses already uses), never as motion.* JSX in a
// server component file.

const SERVER_COMPONENT_FILES = [
  'components/sections/BlogPreview.tsx',
  'components/sections/FeaturedCourses.tsx',
  'components/sections/TeamSection.tsx',
  'app/about/page.tsx',
  'app/success-stories/page.tsx',
];

test('server components never render framer-motion directly (BlogPreview 500 regression)', () => {
  for (const rel of SERVER_COMPONENT_FILES) {
    const src = read(rel);
    assert.ok(!src.startsWith("'use client'"), `${rel} must stay a server component for this check`);
    assert.ok(!/<motion\.[a-zA-Z]+[\s>]/.test(src), `${rel} must not render <motion.*> directly — use a 'use client' wrapper like <FadeIn>`);
    assert.ok(!src.includes('from \'framer-motion\''), `${rel} must not import framer-motion directly`);
  }
});

test('BlogPreview animates through FadeIn, keeping its stagger', () => {
  const blog = read('components/sections/BlogPreview.tsx');
  assert.ok(blog.includes('FadeIn'), 'BlogPreview must use the FadeIn client wrapper');
  assert.ok(blog.includes('delay={i * 0.1}'), 'card stagger (0.1s per card) must stay');
  assert.ok(blog.includes('y={24}'), 'rise offset (24px) must stay');
  assert.ok(blog.includes('getPublishedPosts'), 'BlogPreview must still fetch its posts server-side');
  assert.ok(blog.includes('TiltCard'), '3D tilt on the cards must stay');
});
