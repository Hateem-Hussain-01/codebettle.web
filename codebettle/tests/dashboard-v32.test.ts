// Dashboard V32 (Eman, 18 Nov 2026 — "Dashboard V32" reference
// video, a dark store-admin called "Mercato"; analysis at
// ~/workspace/your_files/dashboard-v32-reference-analysis.md).
//
// MOTION CORRECTION (Eman, 18 Nov 2026 ~22:07 PKT): the video is ONLY
// a reference — the motion must be somewhat DIFFERENT, adapted to
// CodeBettle ("motion bhi hamari codebettle k hawalay say kuch
// different hona chay, video sirf reference tha"). So the ANIMATION
// IDEAS transfer (staggered entrance, count-up numbers, glass cards,
// hover lift) but the MOTION CHARACTER is CodeBettle's own: the slow,
// damped ~1.8s count-up from the hero stats, the FadeIn 0.45s
// ease-out, the card-lift translateY(-2px) over 0.25s ease — NOT the
// video's fast tick or its literal whileHover y:-5.
//
// SCOPE (coordination with the parallel collapsible-sidebar PR):
// this PR touches ONLY the shared primitives (components/ui) and the
// five dashboard pages. PortalLayout, the four server layouts and
// everything under components/layout belong to the sidebar PR —
// page transitions, expandable submenus and the top-bar search are
// the follow-up after it merges. The scope test below enforces that
// with the same git-diff mechanism as the premium-3D guard.
//
// These tests pin the wiring (source-level, like the other guard
// tests). They do not render pixels — visual verification against a
// rendered repro page is in the PR body.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

// ---------------------------------------------------------------- CountUp — CodeBettle's own count-up

test('CountUp: slow damped ~1.8s / 60-step count, same as the hero stats', () => {
  const src = read('components/ui/CountUp.tsx');
  assert.ok(src.includes('const duration = 1800;'), 'count-up must run ~1.8s (the hero timing, not the video fast tick)');
  assert.ok(src.includes('const steps = 60;'), 'count-up must use 60 steps (the hero timing)');
  assert.ok(src.includes('toLocaleString()'), 'integer values must render with toLocaleString (1,500)');
  assert.ok(src.includes('toFixed(1)'), 'decimal values must render with one decimal (4.5)');
  assert.ok(src.includes("prefix = ''"), 'CountUp must accept a prefix (e.g. "PKR ")');
  assert.ok(src.includes("suffix = ''"), 'CountUp must accept a suffix (e.g. "K")');
});

test('CountUp: reduced-motion shows the final value immediately', () => {
  const src = read('components/ui/CountUp.tsx');
  assert.ok(src.includes('useReducedMotion'), 'CountUp must read the reduced-motion preference');
  assert.ok(
    src.includes('if (reduceMotion) {\n      setCount(to);'),
    'reduced-motion must set the final value immediately (no animation, no intermediate values)',
  );
});

// ---------------------------------------------------------------- StatCard

test('StatCard: numeric values count up, strings render as-is', () => {
  const src = read('components/ui/StatCard.tsx');
  assert.ok(src.includes('<CountUp to={value}'), 'a numeric value must count up via CountUp');
  assert.ok(src.includes('typeof value === '), 'StatCard must branch on number vs string value');
  assert.ok(src.includes('decimal={decimal}'), 'StatCard must forward decimal to CountUp');
  assert.ok(src.includes('prefix={prefix}'), 'StatCard must forward prefix to CountUp');
  assert.ok(src.includes('suffix={suffix}'), 'StatCard must forward suffix to CountUp');
});

test('StatCard: staggered entrance via delay, colours + trend unchanged', () => {
  const src = read('components/ui/StatCard.tsx');
  assert.ok(src.includes('delay = 0'), 'StatCard must accept a stagger delay (default 0)');
  assert.ok(src.includes('transition={{ duration: 0.4, delay }}'), 'the delay must feed the entrance transition');
  for (const colour of ['yellow', 'blue', 'green', 'purple', 'red']) {
    assert.ok(src.includes(`${colour}: 'text-`), `colour variant ${colour} must stay`);
  }
  assert.ok(src.includes('trend.value >= 0'), 'the trend arrow + % must stay');
  assert.ok(src.includes('<Card hover glow'), 'StatCard must still render a hoverable glowing Card');
});

test('StatCard: no literal video lift — hover lift is the existing card-lift', () => {
  const src = read('components/ui/StatCard.tsx');
  assert.ok(
    !src.includes('whileHover={{ y: -5 }}'),
    'StatCard must NOT copy the video literal whileHover y:-5 — the lift is Card card-lift (translateY -2px, 0.25s ease)',
  );
  assert.ok(!src.includes('whileHover'), 'StatCard needs no framer-motion hover at all — Card carries the lift');
});

// ---------------------------------------------------------------- Card glass

test('Card: opt-in glass surface, token colours only', () => {
  const src = read('components/ui/Card.tsx');
  assert.ok(src.includes('glass?: boolean'), 'Card must accept an opt-in glass prop');
  assert.ok(
    src.includes("'bg-dark-card/70 backdrop-blur-md rounded-2xl"),
    'glass must be the translucent dark-card surface + blur + 2xl radius (the reference glass-card)',
  );
  assert.ok(
    src.includes(": 'bg-dark-card rounded-xl'"),
    'without glass the card must stay the solid dark card (no behaviour change for existing callers)',
  );
  assert.ok(src.includes("hover && 'card-lift hover:border-primary/40'"), 'hover must still be the existing card-lift');
});

// ---------------------------------------------------------------- Dashboard pages — real values only

test('student dashboard: stats are StatCards over the real counts', () => {
  const src = read('app/student/dashboard/page.tsx');
  assert.ok(src.includes('<StatCard'), 'student stats must use the canonical StatCard');
  for (const needle of ['value: enrollments.length', 'value: completed', 'value: certificates.length']) {
    assert.ok(src.includes(needle), `student stats must still compute from real data: ${needle}`);
  }
  assert.ok(
    !src.includes('{stat.value}</p>'),
    'the old inline stat markup (plain value, no count-up) must be gone',
  );
  assert.ok(src.includes('getEnrollmentsByStudent'), 'the data fetch must stay');
  assert.ok(src.includes('Welcome back, {session!.name.split'), 'the welcome banner must stay');
});

test('instructor dashboard: StatCards staggered, Avg. Rating counts up to the same value', () => {
  const src = read('app/instructor/dashboard/page.tsx');
  assert.ok(src.includes('parseFloat(avgRating)'), 'Avg. Rating must pass the number so it can count up');
  assert.ok(src.includes('decimal'), 'Avg. Rating must count up with one decimal (the same "4.5" as before)');
  for (const needle of ['value={myEnrollments.length}', 'value={published}', 'value={myReviews.length}']) {
    assert.ok(src.includes(needle), `instructor stats must still compute from real data: ${needle}`);
  }
  assert.ok(src.includes('delay={0.05}'), 'the first StatCard must stagger in');
  assert.ok(src.includes('getCoursesByInstructor'), 'the data fetch must stay');
});

test('admin dashboard: revenue counts up to the same "PKR …K", sample chart data untouched', () => {
  const src = read('app/admin/dashboard/dashboard-client.tsx');
  assert.ok(src.includes('Math.round(totalRevenue / 1000)'), 'revenue must pass the rounded number so it can count up');
  assert.ok(src.includes('prefix="PKR "'), 'revenue must keep its "PKR " prefix');
  assert.ok(src.includes('suffix="K"'), 'revenue must keep its "K" suffix');
  // MONTH_DATA / CATEGORY_DATA are pre-existing sample data in the
  // repo — this PR neither invents real data nor removes them.
  assert.ok(src.includes("{ month: 'Jan', enrollments: 42 }"), 'MONTH_DATA must be untouched');
  assert.ok(src.includes("{ name: 'Web Dev', value: 35, color: '#3B82F6' }"), 'CATEGORY_DATA must be untouched');
  assert.ok(src.includes('<BarChart'), 'the enrolments bar chart must stay');
  assert.ok(src.includes('<PieChart'), 'the categories pie chart must stay');
});

test('team dashboard: stats are StatCards over the real counts, credits balance counts up', () => {
  const src = read('app/team/dashboard/page.tsx');
  for (const needle of ['openTasks.length', 'announcements.length', 'meetings.length', 'files.length']) {
    assert.ok(src.includes(needle), `team stats must still compute from real data: ${needle}`);
  }
  assert.ok(src.includes('<StatCard'), 'team stats must use the canonical StatCard');
  assert.ok(src.includes('<CountUp to={credits.summary.balance} />'), 'the credits balance must count up');
  assert.ok(src.includes('getTeamAccessByUserId'), 'the team access lookup (credits strip) must stay');
});

test('ambassador dashboard: 4-stage stats are StatCards over the real stage numbers', () => {
  const src = read('app/student/ambassador/ambassador-dashboard-client.tsx');
  for (const needle of ['stats.clicks', 'stats.signups', 'stats.enrollments', 'stats.payments']) {
    assert.ok(src.includes(needle), `ambassador stats must still read the real stage numbers: ${needle}`);
  }
  assert.ok(src.includes('<StatCard'), 'ambassador stats must use the canonical StatCard');
  for (const needle of ['copyLink', 'saveGroup', 'sendMessage']) {
    assert.ok(src.includes(needle), `ambassador functionality must stay: ${needle}`);
  }
  assert.ok(src.includes('ambassador.referralCode'), 'the referral code must still show');
});

// ---------------------------------------------------------------- Motion character — no literal video copy

test('V32 files: the video literal whileHover y:-5 appears nowhere', () => {
  const files = [
    'components/ui/CountUp.tsx',
    'components/ui/StatCard.tsx',
    'components/ui/Card.tsx',
    'app/student/dashboard/page.tsx',
    'app/instructor/dashboard/page.tsx',
    'app/team/dashboard/page.tsx',
    'app/admin/dashboard/dashboard-client.tsx',
    'app/student/ambassador/ambassador-dashboard-client.tsx',
  ];
  for (const file of files) {
    const src = read(file);
    assert.ok(
      !src.includes('whileHover={{ y: -5 }}'),
      `${file} must not copy the video literal whileHover y:-5 (motion correction, 18 Nov 2026)`,
    );
  }
});

// ---------------------------------------------------------------- Scope guard (same mechanism as the premium-3D guard)

const V32_ALLOWLIST = [
  'codebettle/components/ui/CountUp.tsx',
  'codebettle/components/ui/Card.tsx',
  'codebettle/components/ui/StatCard.tsx',
  'codebettle/app/student/dashboard/page.tsx',
  'codebettle/app/instructor/dashboard/page.tsx',
  'codebettle/app/team/dashboard/page.tsx',
  'codebettle/app/admin/dashboard/dashboard-client.tsx',
  'codebettle/app/student/ambassador/ambassador-dashboard-client.tsx',
  'codebettle/tests/dashboard-v32.test.ts',
];

function changedFiles(): string[] {
  // Union of the committed branch diff AND the working tree (unstaged
  // + staged): during development the changes are uncommitted, so
  // origin/main...HEAD alone is empty; after the commit it carries
  // them; on main after the merge everything is empty and the guard
  // passes vacuously (same pattern as the premium-3D guard).
  const cmds = [
    'git diff --name-only origin/main...HEAD',
    'git diff --name-only',
    'git diff --name-only --cached',
  ];
  const out = new Set<string>();
  for (const cmd of cmds) {
    try {
      const res = execSync(cmd, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      for (const line of res.split('\n')) {
        const f = line.trim();
        if (f) out.add(f);
      }
    } catch {
      // No git available (or not a git checkout) — the manual diff
      // audit in the PR body is the backstop; do not fail the suite.
      return [];
    }
  }
  return [...out];
}

test('V32 scope: only the primitives + the five dashboard pages change', () => {
  const changed = changedFiles();
  if (changed.length === 0) return; // Merged state (empty diff) passes trivially.
  // On the branch every changed file must be in the allowlist.
  // PortalLayout, the server layouts and components/layout belong to
  // the sidebar PR — if this test fails, the V32 branch has clobbered
  // the sidebar work.
  const outside = changed.filter((f) => !V32_ALLOWLIST.includes(f));
  assert.equal(
    outside.length,
    0,
    `V32 must not touch files outside its scope (sidebar/layout files belong to the sidebar PR):\n` +
      outside.map((f) => `  ${f}`).join('\n'),
  );
});
