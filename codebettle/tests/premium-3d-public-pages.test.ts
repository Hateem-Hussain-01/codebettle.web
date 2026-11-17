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

test('hero is a real 3D scene: the code window stays, the old parallax/chips/tilt are gone', () => {
  const hero = read('components/sections/HeroSection.tsx');
  assert.ok(hero.includes('hello.py'), 'hero visual must be the Python code window');
  assert.ok(hero.includes('become_developer'), 'code window must show the snippet');
  assert.ok(hero.includes('HeroSceneWrapper'), 'hero must mount the real 3D scene wrapper');
  // The old PR #60 hero motion is replaced by the scene — none of it
  // may survive in the hero (it would fight the 3D camera parallax).
  assert.ok(!hero.includes('FLOATING_ICONS'), 'floating icons must be gone — the scene carries the motion now');
  assert.ok(!hero.includes('Live interactive classes'), 'live-classes chip must be gone');
  assert.ok(!hero.includes('Verified certificates'), 'certificates chip must be gone');
  assert.ok(!hero.includes('<TiltCard'), 'TiltCard must be gone from the hero — the code window is static now');
  assert.ok(!hero.includes("ui/TiltCard"), 'the TiltCard import must be gone from the hero');
  assert.ok(!hero.includes('useMotionValue'), 'mouse parallax motion values must be gone');
  assert.ok(!hero.includes('onMouseMove'), 'the hero must not track the mouse itself — the scene does it');
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
  // PR B (17 Nov 2026): this guard was written for the PR #60 3D
  // branch, whose scope was ONLY the four public pages. Later branches
  // legitimately touch the portals (the credits system adds an admin
  // Credits Management section and a team-dashboard strip), so the
  // guard now applies ONLY to a branch that actually touches the 3D
  // transformation's files. A 3D branch must still leave every
  // dashboard alone.
  const threeDFiles = [
    'codebettle/components/sections/',
    'codebettle/components/ui/TiltCard.tsx',
    'codebettle/app/page.tsx',
    'codebettle/app/about/',
    'codebettle/app/spotlight/',
    'codebettle/app/contact/',
    'codebettle/app/globals.css',
  ];
  const touches3D = changed.some((f) => threeDFiles.some((p) => f.startsWith(p)));
  if (!touches3D) return;
  const dashboardPrefixes = [
    'codebettle/app/student/',
    'codebettle/app/admin/',
    'codebettle/app/instructor/',
    'codebettle/app/ambassador/',
    'codebettle/components/layout/PortalLayout.tsx',
  ];
  // View-as extension (16 Nov 2026): exactly TWO dashboard files
  // change, both as view-as ENTRY POINTS only — the Switch on each
  // ambassador row (admin/ambassadors) and the targeted
  // /student/ambassador exception in the student layout. Nothing
  // else in any dashboard changes; the guard still fails on any
  // other dashboard file. (The guard compares committed state, so
  // it only sees these once the branch is committed — uncommitted
  // edits never trip it.)
  // Team view-as (17 Nov 2026): the admin Team list gains the same
  // Switch — one per granted member row — as the third view-as
  // entry point. Same pattern, same allowlist.
  const VIEW_AS_ALLOWLIST = [
    'codebettle/app/admin/ambassadors/ambassadors-client.tsx',
    'codebettle/app/admin/team/team-client.tsx',
    'codebettle/app/student/layout.tsx',
  ];
  // Ambassador flow (Eman, 16 Nov 2026 — register-first apply,
  // dashboard switcher, login-form link): these 5 dashboard files
  // ARE the feature — the instructor layout gains the Ambassador nav
  // item, the student layout exempts the ambassador page for
  // teacher-capable sessions, the ambassador dashboard gains the
  // switcher, and /ambassador/login hides the self-link. They are
  // allowed here; any OTHER dashboard file in the diff is still a
  // failure, so this guard keeps catching unintended dashboard
  // changes from public-page work.
  const allowedDashboardChanges = new Set([
    'codebettle/app/ambassador/login/page.tsx',
    'codebettle/app/instructor/layout.tsx',
    'codebettle/app/student/ambassador/ambassador-dashboard-client.tsx',
    'codebettle/app/student/ambassador/page.tsx',
    'codebettle/app/student/layout.tsx',
    // Team-card socials (PR #65, 16 Nov 2026): the "Show on card (pick
    // up to 2)" picker lives in the admin Team form — it IS the feature.
    // The branch touches codebettle/components/sections/ (TeamSection)
    // so this guard applies; only this one admin file is allowed.
    'codebettle/app/admin/success-stories-management/management-client.tsx',
  ]);
  const offending = changed.filter(
    (f) =>
      dashboardPrefixes.some((p) => f.startsWith(p)) &&
      !VIEW_AS_ALLOWLIST.includes(f) &&
      !allowedDashboardChanges.has(f),
  );
  assert.deepEqual(offending, [], `dashboard files must not change: ${offending.join(', ')}`);
  // Stats section (Step 2, 17 Nov 2026): the stat CARDS may gain the
  // TiltCard wrap — Eman's explicit Step 2 order — but the numbers,
  // labels and Counter must stay untouched. The numbers are confirmed
  // real by Eman (17 Nov), so the old byte-identical rule (written
  // when the numbers were unverified) is now a content rule: the
  // diff must not remove or change any stat value, label, or the
  // Counter. The 'statistics section intact' test above is the
  // second backstop. No other file gets this treatment.
  const statsDiff = (() => {
    try {
      return execSync('git diff origin/main...HEAD -- codebettle/components/sections/StatsSection.tsx', {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      return '';
    }
  })();
  const removed = statsDiff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
  for (const needle of [
    'value: 1500',
    'value: 8',
    'value: 300',
    'value: 4.8',
    'Active Students',
    'Expert Courses',
    'Certificates Issued',
    'Average Rating',
    'function Counter',
  ]) {
    assert.ok(
      !removed.some((l) => l.includes(needle)),
      `StatsSection diff must not remove/change: ${needle}`,
    );
  }
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

// ---------------------------------------------------------------- Hero headline one line
// (16 Nov 2026 — Eman: the typewriter headline wrapped to two lines
// for the longest words, e.g. "Become a DevOps Engineer", and every
// wrap pushed the whole section below — subtext, CTAs, code window —
// down, then back up on the next word. A layout shift on each
// typewriter cycle.) The headline must stay on ONE line at every
// viewport: whitespace-nowrap plus a fluid clamp size (20px on small
// phones, 72px max on desktop) inside the wide max-w-7xl container.
// The old fixed breakpoint sizes (text-4xl/5xl/7xl) wrapped because
// the longest phrase is ~1116px wide at 72px in a wide bold font.

test('hero headline stays on one line at every viewport (no wrap, no layout shift)', () => {
  const hero = read('components/sections/HeroSection.tsx');
  assert.ok(hero.includes('whitespace-nowrap'), 'hero h1 must be whitespace-nowrap so the typewriter word never wraps');
  assert.ok(hero.includes('text-[clamp(1.25rem,5.2vw,4.5rem)]'), 'hero h1 must use a fluid clamp size (20px -> 72px) so the longest phrase fits one line');
  assert.ok(hero.includes('max-w-7xl'), 'hero container must be max-w-7xl so the longest phrase fits at the 72px cap');
  assert.ok(!hero.includes('text-4xl sm:text-5xl lg:text-7xl'), 'old fixed breakpoint headline sizes must be gone — they wrapped on long words');
  assert.ok(hero.includes('h-[0.75em]'), 'typewriter cursor must scale with the fluid font (em-relative), not a fixed 40px');
});
