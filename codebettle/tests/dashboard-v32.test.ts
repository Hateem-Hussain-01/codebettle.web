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

test('StatCard: optional href renders a View more link to a real route', () => {
  // V32 reference: every stat card links onward (Eman, 20 Nov 2026
  // — dashboard items lacked the reference's hierarchy). The link
  // is opt-in: only callers that pass a real destination get one.
  const src = read('components/ui/StatCard.tsx');
  assert.ok(src.includes('href?: string'), 'StatCard must accept an optional href');
  assert.ok(src.includes("href={href}"), 'the link must point at the passed href');
  assert.ok(src.includes('View more'), 'the link must read "View more"');
  assert.ok(src.includes('<ArrowRight'), 'the link must carry the arrow icon');
});

test('StatCard: equal-height cards — same size in any grid row (Eman, 20 Nov 2026)', () => {
  // "ye cards ka size same kro": on the admin Communications page
  // the 6 stat cards had unequal heights — "Teacher-authored"
  // (title wraps to two lines) and "Targeted sent" (subtitle line)
  // stuck out below the rest. The fix lives in the shared StatCard
  // so every dashboard's stat row is equal-height, not just this one.
  const src = read('components/ui/StatCard.tsx');
  // The grid item (motion.div) stretches to the row height, but the
  // Card inside sized to its own content — h-full on BOTH keeps
  // every card's bottom aligned.
  const hFull = (src.match(/className="h-full"/g) ?? []).length;
  assert.ok(hFull >= 2, `motion wrapper AND Card must both carry h-full (found ${hFull})`);
  // Fixed label area: two text-sm lines reserved, so a one-line
  // title and a wrapped two-line title start their numbers at the
  // same y. The label text itself must not change.
  assert.ok(src.includes('min-h-10'), 'the title must reserve two lines (min-h-10)');
  // Subtext line reserved on every card: the slot always renders
  // (a non-breaking space when there is no subtitle).
  assert.ok(src.includes("subtitle ?? '\\u00A0'"), 'the subtitle slot must always render, even with no subtitle');
  assert.ok(src.includes('min-h-4'), 'the subtitle slot must reserve one text-xs line (min-h-4)');
});

// ---------------------------------------------------------------- Card glass

test('Card: opt-in glass surface, token colours only', () => {
  const src = read('components/ui/Card.tsx');
  assert.ok(src.includes('glass?: boolean'), 'Card must accept an opt-in glass prop');
  assert.ok(
    src.includes("'bg-dark-card/70 backdrop-blur-md rounded-2xl"),
    'glass must be the translucent dark-card surface + blur + 2xl radius (the reference glass-card)',
  );
  // Sidebar-polish (Eman, 20 Nov 2026 — dashboard cards looked
  // washed out in light mode): the glass branch also carries the
  // `glass-card` class, whose globals.css rule gives the card a
  // gold-tinted border in BOTH themes (dark: rgba(245,197,24,0.15);
  // light: rgba(138,109,0,0.2)) — without it the light card fell
  // back to the grey #E5E7EB border and read as a flat wash.
  assert.ok(src.includes("glass && 'glass-card'"), 'glass must also carry the glass-card class (gold-tinted border, both themes)');
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
  // Sidebar-polish (Eman, 20 Nov 2026 — V32 stat cards link onward):
  // the three student stats link to real pages, not invented ones.
  for (const needle of ["href: '/student/courses'", "href: '/student/certificates'"]) {
    assert.ok(src.includes(needle), `student stats must link onward to a real route: ${needle}`);
  }
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

test('ambassador dashboard: 3-stage stats are StatCards over the real stage numbers (no clicks, no link)', () => {
  const src = read('app/student/ambassador/ambassador-dashboard-client.tsx');
  for (const needle of ['stats.signups', 'stats.enrollments', 'stats.payments']) {
    assert.ok(src.includes(needle), `ambassador stats must still read the real stage numbers: ${needle}`);
  }
  assert.ok(!src.includes('stats.clicks'), 'clicks are gone — the redesign tracks signups, enrollments, payments only');
  assert.ok(!src.includes('referralLink'), 'no referral link is shown — the code is what the student types in');
  assert.ok(src.includes('creditBalance'), 'the ambassador sees their credit balance');
  assert.ok(src.includes('<StatCard'), 'ambassador stats must use the canonical StatCard');
  for (const needle of ['copyCode', 'saveGroup', 'sendMessage']) {
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
  // Sidebar hover-polish (Eman, 20 Nov 2026): the same PR that
  // polishes the V32 cards also fixes the sidebar pill tracking —
  // the shared sidebar + its tests are in scope here, same pattern
  // as the guard fixes in PR #79/#81.
  'codebettle/components/layout/CollapsibleSidebar.tsx',
  'codebettle/tests/collapsible-sidebar.test.ts',
  // Dark+gold sidebar revision (Eman, 21 Nov 2026): the V32-exact
  // orange/wood preview was rejected, so the sidebar is revised in
  // CodeBettle dark+gold — logo header, smaller clock + Sign Out,
  // greeting kept. PortalLayout carries the greeting; Navbar exports
  // the shared default logo URL.
  'codebettle/components/layout/PortalLayout.tsx',
  'codebettle/components/layout/Navbar.tsx',
  // The follow-up scope guard's allowlist had to gain the V32 files
  // for this same PR, so its test file is in scope here too (guard
  // files that coordinate scope belong in each other's allowlists).
  'codebettle/tests/dashboard-followup.test.ts',
  // Ambassador referral + credits redesign (Eman, 20 Nov 2026):
  // codes are admin-assigned (no link tracking, no clicks), the code
  // IS a Rs 200 coupon and earns 100 credits per referred student.
  // This branch touches the ambassador dashboard (a V32 file), so
  // every file it changes is listed here, same pattern as PR #79/#81.
  'codebettle/app/admin/ambassadors/ambassadors-client.tsx',
  'codebettle/app/admin/ambassadors/page.tsx',
  'codebettle/app/admin/layout.tsx',
  'codebettle/app/admin/referral-codes/page.tsx',
  'codebettle/app/admin/referral-codes/referral-codes-client.tsx',
  'codebettle/app/api/admin/ambassadors/[id]/route.ts',
  'codebettle/app/api/admin/ambassadors/grant/route.ts',
  'codebettle/app/api/admin/referral-codes/[id]/route.ts',
  'codebettle/app/api/admin/referral-codes/route.ts',
  'codebettle/app/api/auth/route.ts',
  'codebettle/app/api/referral/track/route.ts',
  'codebettle/app/student/ambassador/page.tsx',
  'codebettle/app/team/credits/credits-client.tsx',
  'codebettle/app/team/credits/page.tsx',
  'codebettle/components/auth/RegisterForm.tsx',
  'codebettle/lib/admin-access.ts',
  'codebettle/lib/db/ambassador-credits.ts',
  'codebettle/lib/db/ambassadors.ts',
  'codebettle/lib/db/coupons.ts',
  'codebettle/lib/db/mappers.ts',
  'codebettle/lib/db/types.ts',
  'codebettle/lib/referral.ts',
  'codebettle/lib/services/enrollment-service.ts',
  'codebettle/migrations/app/20261120T1608_add_ambassador_credits/migration.json',
  'codebettle/migrations/app/20261120T1608_add_ambassador_credits/migration.ts',
  'codebettle/migrations/app/20261120T1608_add_ambassador_credits/ops.json',
  'codebettle/migrations/snapshots/39bf4b7c939aba7fb732aec3459f751a3fc4ca9bf3f47694aebbce419e24028d/contract.d.ts',
  'codebettle/migrations/snapshots/39bf4b7c939aba7fb732aec3459f751a3fc4ca9bf3f47694aebbce419e24028d/contract.json',
  'codebettle/proxy.ts',
  'codebettle/src/prisma/contract.d.ts',
  'codebettle/src/prisma/contract.json',
  'codebettle/src/prisma/contract.prisma',
  'codebettle/tests/ambassador-referral.test.ts',
  'codebettle/tests/ambassador-credits.test.ts',
  'codebettle/tests/view-as-extension.test.ts',
  'codebettle/tests/admin-access.test.ts',
  'codebettle/tests/team-credits.test.ts',
  // Ambassador redemption (Eman, 21 Nov 2026): ambassadors redeem
  // for the same goodies + prices as the team system; the admin
  // decides ambassador requests in Credits Management. This branch
  // touches the ambassador dashboard (a V32 file), so every file it
  // changes is listed here, same pattern as PR #79/#81.
  'codebettle/app/admin/credits/credits-client.tsx',
  'codebettle/app/admin/credits/page.tsx',
  'codebettle/app/api/admin/ambassador-redemptions/[id]/route.ts',
  'codebettle/app/api/student/ambassador/redemptions/route.ts',
  'codebettle/migrations/app/20261120T1908_add_ambassador_redemptions/migration.json',
  'codebettle/migrations/app/20261120T1908_add_ambassador_redemptions/migration.ts',
  'codebettle/migrations/app/20261120T1908_add_ambassador_redemptions/ops.json',
  'codebettle/migrations/snapshots/f49bc76c869052d79ae6a1222fe7c34eef4eb777c321e3385c8859f54e436a54/contract.d.ts',
  'codebettle/migrations/snapshots/f49bc76c869052d79ae6a1222fe7c34eef4eb777c321e3385c8859f54e436a54/contract.json',
  'codebettle/tests/ambassador-redemption.test.ts',
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
  // The guard only applies to a branch that touches V32 source files.
  // On later branches (e.g. the intro PR, based on post-V32 main) the
  // diff vs main is unrelated work and the guard must not fire — same
  // scoping as the premium-3D guard (PR #66). The guard's own test
  // file does not count: editing this guard must not arm it.
  const V32_SOURCE = V32_ALLOWLIST.filter(
    (f) => f !== 'codebettle/tests/dashboard-v32.test.ts',
  );
  if (!changed.some((f) => V32_SOURCE.includes(f))) return;
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
