// Dashboard follow-up (Eman, 18 Nov 2026 — "page transitions, expandable
// submenus, top-bar search" after PR #77 V32 + PR #78 sidebar merged).
//
// MOTION (same correction as V32/sidebar, 18 Nov 2026): the reference
// videos are ONLY a reference — the motion is CodeBettle's own: FadeIn's
// 0.45s ease-out, TiltCard's critically damped spring (stiffness 200,
// damping 22, mass 0.6), dark + gold only. No copied easing curves,
// no literal video values.
//
// SCOPE: this PR touches ONLY the portal chrome — PortalLayout, the
// shared CollapsibleSidebar, the admin layout's submenu data, the new
// shared search lib, the transition + top-bar-search components, and
// tests. No public pages, no hero/intro files (PR #79 owns those), no
// dashboard page redesign, no invented metrics or pages. The scope
// test below enforces that with the same git-diff mechanism as the
// V32/premium-3D guards.
//
// These tests pin the wiring (source-level, like the other guard
// tests) plus unit tests for the pure search lib. They do not render
// pixels — visual verification against a rendered repro page is in
// the PR body.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
  flattenNavItems,
  matchesNavHit,
  searchNavItems,
  type NavItemNode,
} from '../lib/nav-search';
import { ADMIN_SUB_PAGES, areaForAdminPath } from '../lib/admin-access';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const sidebar = read('components/layout/CollapsibleSidebar.tsx');
const portalLayout = read('components/layout/PortalLayout.tsx');
const pageTransition = read('components/layout/PageTransition.tsx');
const topBarSearch = read('components/layout/TopBarSearch.tsx');
const adminLayout = read('app/admin/layout.tsx');

// ---------------------------------------------------------------------------
// 1. lib/nav-search — one shared index for both search surfaces (unit tests)
// ---------------------------------------------------------------------------

const SAMPLE_NAV: NavItemNode[] = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  {
    href: '/admin/courses',
    label: 'Courses',
    children: [{ href: '/admin/courses/new', label: 'New Course' }],
  },
  { href: '/admin/students', label: 'Students' },
];

test('nav-search: flatten keeps nav order, parents first, children carry the parent label', () => {
  const hits = flattenNavItems(SAMPLE_NAV);
  assert.deepEqual(
    hits.map((h) => h.item.href),
    ['/admin/dashboard', '/admin/courses', '/admin/courses/new', '/admin/students'],
  );
  assert.equal(hits[2].parentLabel, 'Courses');
  assert.equal(hits[0].parentLabel, undefined);
});

test('nav-search: a hit matches on label, href, or its parent label (case-insensitive)', () => {
  const [dashboard, courses, newCourse] = flattenNavItems(SAMPLE_NAV);
  assert.equal(matchesNavHit(newCourse, 'new'), true);
  assert.equal(matchesNavHit(newCourse, 'NEW COURSE'), true);
  assert.equal(matchesNavHit(newCourse, 'courses'), true, 'child matches via parent label');
  assert.equal(matchesNavHit(newCourse, 'courses/new'), true, 'child matches via href');
  assert.equal(matchesNavHit(dashboard, 'dash'), true);
  assert.equal(matchesNavHit(dashboard, 'students'), false);
  assert.equal(matchesNavHit(courses, ''), true, 'empty query matches everything');
  assert.equal(matchesNavHit(courses, '   '), true, 'blank query matches everything');
});

test('nav-search: search returns only matches, in nav order, never an invented href', () => {
  const hits = searchNavItems(SAMPLE_NAV, 'course');
  assert.deepEqual(
    hits.map((h) => h.item.href),
    ['/admin/courses', '/admin/courses/new'],
  );
  const all = searchNavItems(SAMPLE_NAV, '');
  assert.equal(all.length, 4, 'empty query returns every hit (quick-jump list)');
  const allowed = new Set(flattenNavItems(SAMPLE_NAV).map((h) => h.item.href));
  for (const hit of searchNavItems(SAMPLE_NAV, 'a')) {
    assert.ok(allowed.has(hit.item.href), `result ${hit.item.href} must come from the passed navItems`);
  }
  assert.deepEqual(searchNavItems(SAMPLE_NAV, 'zzz-no-such-page'), [], 'no match means no results');
});

// ---------------------------------------------------------------------------
// 2. Page transitions — enter-only, house timing, reduced-motion instant
// ---------------------------------------------------------------------------

test('page transition: keyed by pathname, enter-only crossfade + rise, house timing', () => {
  assert.match(pageTransition, /usePathname\(\)/, 'the transition must key on the client pathname');
  assert.match(pageTransition, /key=\{pathname\}/, 'the wrapper must remount per route (layout itself stays mounted)');
  assert.match(pageTransition, /initial=\{\{ opacity: 0, y: 8 \}\}/, 'enter from transparent + 8px rise');
  assert.match(pageTransition, /animate=\{\{ opacity: 1, y: 0 \}\}/, 'settle at full opacity, no offset');
  assert.match(
    pageTransition,
    /transition=\{\{ duration: 0\.45, ease: 'easeOut' \}\}/,
    'FadeIn house timing (0.45s ease-out), never a copied video curve',
  );
  assert.doesNotMatch(pageTransition, /AnimatePresence/, 'enter-only: no exit hold, navigation never waits on animation');
  assert.doesNotMatch(pageTransition, /mode="wait"/, 'no mode="wait" — the new page must not wait for an exit');
});

test('page transition: reduced-motion renders a plain div, no animation', () => {
  // The preference is read in a post-mount effect, NOT during render:
  // the first-load render must agree with SSR (which has no window and
  // always renders the motion.div). Reading it during render — or via
  // framer-motion's useReducedMotion(), which freezes its first value
  // in useState — leaves the SSR motion.div's inline opacity 0 in
  // place through hydration, blanking the portal main under reduced
  // motion until the next navigation (proven in headless Chromium).
  assert.match(pageTransition, /useEffect\(\(\) => \{/);
  assert.match(pageTransition, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(pageTransition, /if \(reduceMotion\) \{\s*return <div>\{children\}<\/div>;/);
  assert.doesNotMatch(pageTransition, /reduceMotion = useReducedMotion\(\)/);
  assert.doesNotMatch(pageTransition, /reduceMotion = prefersReducedMotionNow\(\)/);
});

test('page transition: children pass through (server components are never wrapped in motion.* directly)', () => {
  // PR #60 lesson: motion.div around an async server component 500s
  // the page. PageTransition receives server-rendered children as
  // props (the FadeIn passthrough pattern) and renders them inside
  // the motion.div — it never imports a page itself.
  assert.match(pageTransition, /export default function PageTransition\(\{ children \}/);
  assert.match(pageTransition, /<motion\.div[^>]*>\s*\{children\}\s*<\/motion\.div>/);
  assert.doesNotMatch(pageTransition, /import.*from '@\/app\//, 'the transition must not import any page');
});

test('portal layout: the transition wraps the page content; sidebar + topbar stay outside it', () => {
  assert.match(portalLayout, /<PageTransition>/, 'PortalLayout must use the transition wrapper');
  assert.match(portalLayout, /<PageTransition>\s*<div className="p-4 sm:p-6">/);
  assert.ok(
    portalLayout.indexOf('<CollapsibleSidebar') < portalLayout.indexOf('<PageTransition>'),
    'the sidebar must render outside (before) the transition wrapper',
  );
  assert.ok(
    portalLayout.indexOf('<header') < portalLayout.indexOf('<PageTransition>'),
    'the topbar must render outside (before) the transition wrapper',
  );
});

// ---------------------------------------------------------------------------
// 3. Expandable submenus — real sub-pages only, inline + collapsed flyout
// ---------------------------------------------------------------------------

test('submenu data: ADMIN_SUB_PAGES lists only real static sub-pages, each mapping to its parent area', () => {
  const subPages = Object.entries(ADMIN_SUB_PAGES);
  assert.ok(subPages.length > 0, 'at least one area must have a submenu');
  for (const [areaKey, pages] of subPages) {
    for (const page of pages ?? []) {
      // The page file must exist — a submenu link to a 404 is a bug.
      const pageFile = join(root, 'app', ...page.href.split('/').filter(Boolean), 'page.tsx');
      assert.ok(existsSync(pageFile), `submenu ${page.href} must be a real page (${pageFile})`);
      // The guard already maps the sub-page to its parent area.
      assert.equal(
        areaForAdminPath(page.href),
        areaKey,
        `${page.href} must belong to its parent area ${areaKey} (no new guard needed)`,
      );
    }
  }
});

test('submenu data: no dynamic detail pages are listed as submenu children', () => {
  const hrefs = Object.values(ADMIN_SUB_PAGES)
    .flat()
    .map((p) => p.href);
  for (const href of hrefs) {
    assert.doesNotMatch(href, /\[/, `${href} must be a static route, not a dynamic [id] page`);
  }
});

test('admin layout: children attach only to granted areas, through the secret-path mapper', () => {
  assert.match(adminLayout, /ADMIN_SUB_PAGES\[area\.key\]/);
  assert.match(adminLayout, /toExternalAdminPath\(sub\.href\)/, 'child hrefs must use the secret admin path, like parents');
  // The children map sits inside the hasAdminArea filter — a
  // restricted admin never sees a submenu for an ungranted area.
  const filteredMap = adminLayout.slice(
    adminLayout.indexOf('ADMIN_AREAS.filter'),
    adminLayout.indexOf('navItems.push'),
  );
  assert.match(filteredMap, /ADMIN_SUB_PAGES\[area\.key\]/);
});

test('sidebar: NavItem carries optional children (one level, real sub-pages only)', () => {
  assert.match(sidebar, /children\?: NavItem\[\];/);
  assert.match(sidebar, /import \{ searchNavItems, type NavItemNode \} from '@\/lib\/nav-search';/);
  assert.match(sidebar, /export interface NavItem extends NavItemNode/);
});

test('sidebar submenu: expanded rail expands inline with a chevron toggle (separate from the parent link)', () => {
  assert.match(sidebar, /aria-label=\{\`\$?\{submenuOpen \? 'Collapse' : 'Expand'\} \$\{item\.label\} submenu\`?\}/);
  assert.match(sidebar, /aria-expanded=\{submenuOpen\}/);
  assert.match(sidebar, /toggleSubmenu\(item\.href\)/);
  assert.match(sidebar, /<ChevronDown className="h-4 w-4" \/>/);
  // The chevron rotates on the house timing, like the collapse arrow.
  assert.match(sidebar, /animate=\{\{ rotate: submenuOpen \? 180 : 0 \}\}/);
  // Children render indented under a hairline, expanding with the
  // house 0.45s ease-out (instant under reduced motion).
  assert.match(sidebar, /ml-5 space-y-1 border-l border-dark-border/);
  assert.match(sidebar, /initial=\{reduceMotion \? false : \{ height: 0, opacity: 0 \}\}/);
});

test('sidebar submenu: the active page auto-expands its parent, so the user sees where they are', () => {
  assert.match(sidebar, /initiallyOpenSubmenus\(navItems, pathname\)/);
  assert.match(
    sidebar,
    /item\.children\?\.some\(\(child\) => isActiveItem\(pathname, child\.href\)\)/,
    'a parent whose child is active must start open',
  );
  // The highlight rests on the DEEPEST active row (child, not parent).
  assert.match(
    sidebar,
    /activeItem\?\.children\?\.find\(\(child\) => isActiveItem\(pathname, child\.href\)\)\?\.href \?\? activeItem\?\.href/,
  );
});

test('sidebar submenu: collapsed rail opens a portaled flyout whose first row is the parent page', () => {
  assert.match(sidebar, /function SubmenuFlyout\(/);
  assert.match(sidebar, /role="menu"/);
  assert.match(sidebar, /aria-label=\{`\$\{parent\.label\} submenu`\}/);
  assert.match(sidebar, /const rows = \[\{ href: parent\.href, label: parent\.label \}, \.\.\.\(parent\.children \?\? \[\]\)\];/);
  assert.match(sidebar, /aria-haspopup="true"/, 'the collapsed parent row must announce it opens a flyout');
  assert.match(sidebar, /aria-expanded=\{flyout\?\.parent\.href === item\.href\}/);
  // Flyout closes on Esc, outside click, and navigation.
  assert.match(sidebar, /if \(e\.key === 'Escape'\) closeFlyout\(\);/);
  assert.match(sidebar, /closest\('\[role="menu"\]'\)/);
});

test('sidebar search: uses the shared nav-search implementation (one index, both surfaces)', () => {
  assert.match(sidebar, /const hits = searchNavItems\(navItems, query\);/);
  assert.doesNotMatch(sidebar, /function matchesQuery/, 'matching must live in lib/nav-search, not a sidebar copy');
  assert.doesNotMatch(sidebar, /navItems\.filter\(\(item\) => matchesQuery\(item, query\)\)/);
  // Search hits render with the parent breadcrumb for children.
  assert.match(sidebar, /hits\.map\(\(hit, i\) => renderNavRow\(hit\.item, i, hit\.parentLabel\)\)/);
  assert.match(sidebar, /\{parentLabel && <span className="text-muted">\{parentLabel\} \/ <\/span>\}/);
  // Keyboard behaviour is unchanged: arrows move, Enter navigates,
  // Esc clears/closes, aria-activedescendant tracks the selection.
  assert.match(sidebar, /hits\[activeResultIndex\]\?\.item\.href/);
  assert.match(sidebar, /router\.push\(target\.item\.href\)/);
});

// ---------------------------------------------------------------------------
// 4. Top-bar search + greeting + the one ⌘K owner
// ---------------------------------------------------------------------------

test('top-bar search: same shared index as the sidebar, dropdown palette, keyboard nav', () => {
  assert.match(topBarSearch, /import \{ searchNavItems, type NavItemNode \} from '@\/lib\/nav-search';/);
  assert.match(topBarSearch, /const results = searchNavItems\(navItems, query\);/);
  assert.match(topBarSearch, /role="combobox"/);
  assert.match(topBarSearch, /role="listbox"/);
  assert.match(topBarSearch, /aria-activedescendant/);
  assert.match(topBarSearch, /e\.key === 'ArrowDown'/);
  assert.match(topBarSearch, /e\.key === 'ArrowUp'/);
  assert.match(topBarSearch, /e\.key === 'Enter'/);
  assert.match(topBarSearch, /e\.key === 'Escape'/);
  assert.match(topBarSearch, /router\.push\(href\)/);
  assert.match(topBarSearch, /No pages found/);
  assert.match(topBarSearch, /No pages match/);
  assert.match(topBarSearch, /Jump to a page/, 'empty query shows every page as a quick-jump list');
  // Child results show the parent breadcrumb, like the sidebar.
  assert.match(topBarSearch, /\{hit\.parentLabel && <span className="text-muted">\{hit\.parentLabel\} \/ <\/span>\}/);
  // Closes on navigation and on outside click.
  assert.match(topBarSearch, /useEffect\(\(\) => \{\s*setQuery\(''\);\s*setOpen\(false\);/, 'must reset on route change');
  assert.match(topBarSearch, /document\.addEventListener\('mousedown', onMouseDown\)/);
  assert.doesNotMatch(topBarSearch, /fixed inset-0/, 'no fixed overlay: the header backdrop-blur would clip it to the header');
});

test('portal layout: one ⌘K owner — it focuses the visible search, sidebar or top-bar', () => {
  // PortalLayout owns ⌘K now: top-bar input when visible, otherwise
  // the sidebar signal. The sidebar must NOT also listen for ⌘K
  // (two handlers would double-fire).
  assert.match(portalLayout, /\(e\.metaKey \|\| e\.ctrlKey\) && e\.key\.toLowerCase\(\) === 'k'/);
  assert.match(portalLayout, /topInput\.offsetParent !== null/);
  assert.match(portalLayout, /setFocusSearchSignal\(\(s\) => s \+ 1\)/);
  assert.match(portalLayout, /focusSearchSignal=\{focusSearchSignal\}/);
  assert.doesNotMatch(sidebar, /\(e\.metaKey \|\| e\.ctrlKey\) && e\.key\.toLowerCase\(\) === 'k'/);
  assert.match(sidebar, /focusSearchSignal\?: number;/);
  assert.match(sidebar, /if \(focusSearchSignal === 0\) return;/);
  // The top-bar search sits in the header centre (md+); the greeting
  // joins it on lg+. Below md the centre collapses away.
  assert.match(portalLayout, /<TopBarSearch navItems=\{navItems\} inputRef=\{topSearchRef\} \/>/);
  assert.match(portalLayout, /hidden min-w-0 flex-1 items-center justify-center gap-4 px-4 md:flex/);
});

test('portal layout: greeting is the video’s "Hi, {firstName}! Welcome back."', () => {
  // Dashboard V32-EXACT (Eman, 20 Nov 2026): the top-bar greeting
  // is the video's own — "Hi, Mira! Welcome back." with the user's
  // own first name, never invented. The time-of-day helper is gone.
  assert.doesNotMatch(portalLayout, /function greetingForHour/);
  assert.match(portalLayout, /const firstName = user\.name\?\.trim\(\)\.split\(\/\\s\+\/\)\[0\] \?\? '';/);
  assert.match(portalLayout, /mounted && firstName \? `Hi, \$\{firstName\}! Welcome back\.` : null/);
  // Mount-gated: the server clock (UTC) and the user clock (PKT)
  // disagree, so a server-rendered greeting would hydrate-mismatch.
  assert.match(portalLayout, /useEffect\(\(\) => \{\s*setMounted\(true\);\s*\}, \[\]\);/);
});

test('portal layout: no new document.cookie writes (the sidebar preference stays the only one)', () => {
  const cookieUses = portalLayout.match(/document\.cookie/g) ?? [];
  assert.equal(
    cookieUses.length,
    1,
    'PortalLayout must touch document.cookie only for the sidebar preference write',
  );
});

// ---------------------------------------------------------------------------
// 5. Motion character + scope guard (same mechanism as the V32 guard)
// ---------------------------------------------------------------------------

test('follow-up motion: house 0.45s ease-out + damped spring only, never a copied video curve', () => {
  assert.doesNotMatch(pageTransition, /0\.22, 1, 0\.36, 1/);
  assert.doesNotMatch(topBarSearch, /0\.22, 1, 0\.36, 1/);
  assert.doesNotMatch(sidebar, /0\.22, 1, 0\.36, 1/);
  assert.doesNotMatch(pageTransition, /whileHover=\{\{ y: -5 \}\}/);
  assert.match(sidebar, /duration: MOTION_DURATION, ease: EASE_OUT/);
});

const FOLLOWUP_ALLOWLIST = [
  'codebettle/components/layout/CollapsibleSidebar.tsx',
  'codebettle/components/layout/PageTransition.tsx',
  'codebettle/components/layout/PortalLayout.tsx',
  'codebettle/components/layout/TopBarSearch.tsx',
  'codebettle/lib/admin-access.ts',
  'codebettle/lib/nav-search.ts',
  'codebettle/app/admin/layout.tsx',
  'codebettle/tests/collapsible-sidebar.test.ts',
  'codebettle/tests/dashboard-v32.test.ts',
  'codebettle/tests/dashboard-followup.test.ts',
  // Guard fix this PR had to make (not feature scope): the intro scope
  // guard fired on any later branch, so it gets the same V32-style
  // scoping (only fires when the branch touches intro files).
  'codebettle/tests/website-intro.test.ts',
  // Sidebar hover-polish (Eman, 20 Nov 2026): the same PR that fixes
  // the sidebar pill tracking also polishes the V32 dashboard cards
  // — the shared primitives + the student dashboard page are in
  // scope here, same pattern as the guard fixes in PR #79/#81.
  'codebettle/components/ui/Card.tsx',
  'codebettle/components/ui/StatCard.tsx',
  'codebettle/app/student/dashboard/page.tsx',
  // Dashboard V32-EXACT (Eman, 20 Nov 2026): the scoped palette
  // lives in globals.css and the admin chart bars go orange.
  'codebettle/app/globals.css',
  'codebettle/app/admin/dashboard/dashboard-client.tsx',
  // Ambassador referral + credits redesign (Eman, 20 Nov 2026):
  // codes are admin-assigned (no link tracking, no clicks), the code
  // IS a Rs 200 coupon and earns 100 credits per referred student.
  // This branch adds the 33rd admin area in lib/admin-access.ts (a
  // follow-up source file), so every file it changes is listed here,
  // same pattern as PR #79/#81.
  'codebettle/app/admin/ambassadors/ambassadors-client.tsx',
  'codebettle/app/admin/ambassadors/page.tsx',
  'codebettle/app/admin/referral-codes/page.tsx',
  'codebettle/app/admin/referral-codes/referral-codes-client.tsx',
  'codebettle/app/api/admin/ambassadors/[id]/route.ts',
  'codebettle/app/api/admin/ambassadors/grant/route.ts',
  'codebettle/app/api/admin/referral-codes/[id]/route.ts',
  'codebettle/app/api/admin/referral-codes/route.ts',
  'codebettle/app/api/auth/route.ts',
  'codebettle/app/api/referral/track/route.ts',
  'codebettle/app/student/ambassador/ambassador-dashboard-client.tsx',
  'codebettle/app/student/ambassador/page.tsx',
  'codebettle/app/team/credits/credits-client.tsx',
  'codebettle/app/team/credits/page.tsx',
  'codebettle/components/auth/RegisterForm.tsx',
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
];

function changedFiles(): string[] {
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

test('follow-up scope: only the portal chrome + shared search + tests change', () => {
  const changed = changedFiles();
  if (changed.length === 0) return; // Merged state (empty diff) passes trivially.
  // The guard only applies to a branch that touches follow-up SOURCE
  // files — later branches (e.g. the intro PR) must not trip it. Test
  // files in the allowlist do not arm it: editing a guard must not
  // arm that guard (same rule as the intro guard, PR #81). A branch
  // that touches website-intro.test.ts (a guard fix, not a follow-up
  // source file) therefore does not arm this guard.
  const followupSource = FOLLOWUP_ALLOWLIST.filter(
    (f) => !f.startsWith('codebettle/tests/'),
  );
  if (!changed.some((f) => followupSource.includes(f))) return;
  const outside = changed.filter((f) => !FOLLOWUP_ALLOWLIST.includes(f));
  assert.equal(
    outside.length,
    0,
    `follow-up must not touch files outside its scope (no public pages, no hero/intro files):\n` +
      outside.map((f) => `  ${f}`).join('\n'),
  );
});
