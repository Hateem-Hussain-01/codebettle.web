/**
 * Premium animated collapsible sidebar (Eman, 18 Nov 2026 — "Glassy
 * SideBar V5" video). One shared component
 * (components/layout/CollapsibleSidebar.tsx) renders every portal's
 * sidebar; the four server layouts pass their own permission-filtered
 * navItems and the persisted collapsed state (cookie). PortalLayout
 * only owns the width + the toggle's cookie write.
 *
 * The interaction is asserted by source inspection (the component
 * needs a browser session to render — see the PR's screenshots);
 * the cookie helpers are unit-tested directly. The no-nav-mixing
 * tests pin the rule that each portal's sidebar shows only its own
 * routes: a student nav never contains an admin href and vice versa.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseSidebarCollapsed,
  sidebarCollapsedCookieString,
  SIDEBAR_COLLAPSED_COOKIE,
} from '../lib/sidebar';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const sidebar = read('components/layout/CollapsibleSidebar.tsx');
const portalLayout = read('components/layout/PortalLayout.tsx');
const studentLayout = read('app/student/layout.tsx');
const instructorLayout = read('app/instructor/layout.tsx');
const teamLayout = read('app/team/layout.tsx');
const adminLayout = read('app/admin/layout.tsx');

// ---------------------------------------------------------------------------
// 1. Cookie persistence (lib/sidebar.ts) — unit tests
// ---------------------------------------------------------------------------

test('cookie: only the exact value "1" means collapsed', () => {
  assert.equal(parseSidebarCollapsed('1'), true);
  for (const notCollapsed of ['0', 'true', 'yes', '', ' 1', '2', null, undefined]) {
    assert.equal(parseSidebarCollapsed(notCollapsed), false, JSON.stringify(notCollapsed));
  }
});

test('cookie: the toggle writes a named, long-lived, SameSite cookie', () => {
  assert.equal(SIDEBAR_COLLAPSED_COOKIE, 'cb-sidebar-collapsed');
  const collapsed = sidebarCollapsedCookieString(true);
  assert.match(collapsed, /^cb-sidebar-collapsed=1; /);
  assert.match(collapsed, /Max-Age=31536000/);
  assert.match(collapsed, /Path=\//);
  assert.match(collapsed, /SameSite=Lax/);
  const expanded = sidebarCollapsedCookieString(false);
  assert.match(expanded, /^cb-sidebar-collapsed=0; /);
  assert.match(expanded, /Max-Age=31536000/);
});

// ---------------------------------------------------------------------------
// 2. Collapse / expand — both states render, labels fade, rail widths
// ---------------------------------------------------------------------------

test('toggle: a dedicated button at the top flips the arrow and reports aria-expanded', () => {
  assert.match(sidebar, /aria-label="Collapse sidebar"/);
  assert.match(sidebar, /aria-label="Expand sidebar"/);
  assert.match(sidebar, /aria-expanded=\{true\}/);
  assert.match(sidebar, /aria-expanded=\{false\}/);
  // The arrow rotates 180° on collapse (video: ›/‹ flip), 300ms ease.
  assert.match(sidebar, /animate=\{\{ rotate: 180 \}\}/);
  assert.match(sidebar, /animate=\{\{ rotate: 0 \}\}/);
  // Collapsed header shows the compact mark + toggle, side by side.
  assert.match(sidebar, /Expand sidebar/);
});

test('widths: expanded rail is w-64, collapsed rail is w-20, width transitions', () => {
  assert.match(portalLayout, /collapsed \? 'w-20' : 'w-64'/);
  // CodeBettle motion (Eman, 18 Nov 2026 — motion correction): the
  // width moves on FadeIn's house timing (0.45s ease-out), not the
  // video's fast expo glide.
  assert.match(portalLayout, /transition-\[width\] duration-450 ease-out/);
  // The flex content area follows the rail — no fixed margin that
  // would leave a gap or overlap when the rail shrinks.
  assert.doesNotMatch(portalLayout, /ml-64/);
  assert.doesNotMatch(portalLayout, /pl-64/);
});

test('labels: fade with a stagger on expand, disappear before the rail shrinks', () => {
  // Sequenced toggle: labels fade out (300ms) before the width flips
  // on collapse; the rail grows first and labels fade in after on expand.
  assert.match(sidebar, /COLLAPSE_LABEL_DELAY_MS = 300/);
  assert.match(sidebar, /EXPAND_LABEL_DELAY_MS = 150/);
  assert.match(sidebar, /transition-opacity duration-300/);
  // Stagger: each label fades in 30ms after the previous, capped.
  assert.match(sidebar, /Math\.min\(index \* 30, 240\)/);
  // While collapsed the label is out of flow (absolute) so the icon
  // centres instead of the invisible label holding the row's width.
  assert.match(sidebar, /absolute left-11 top-1\/2 w-0 -translate-y-1\/2 opacity-0/);
});

test('persistence: the toggle writes the cookie; the server layouts seed from it', () => {
  assert.match(portalLayout, /document\.cookie = sidebarCollapsedCookieString\(next\)/);
  assert.match(portalLayout, /defaultCollapsed = false/);
  assert.match(portalLayout, /useState\(defaultCollapsed\)/);
  for (const [name, layout] of [
    ['student', studentLayout],
    ['instructor', instructorLayout],
    ['team', teamLayout],
    ['admin', adminLayout],
  ] as const) {
    assert.ok(
      layout.includes('parseSidebarCollapsed((await cookies()).get(SIDEBAR_COLLAPSED_COOKIE)?.value)'),
      `${name} layout must read the collapsed cookie`,
    );
    assert.match(layout, /defaultCollapsed=\{defaultCollapsed\}/, `${name} layout must pass it to PortalLayout`);
  }
});

// ---------------------------------------------------------------------------
// 3. Search — filters the passed navItems, keyboard, collapsed icon
// ---------------------------------------------------------------------------

test('search: filters the passed navItems (real routes only), with an empty state', () => {
  assert.match(sidebar, /placeholder="Search pages"/);
  // The scope is the navItems prop — the permission-filtered routes
  // the server layout passed — never a hardcoded dummy list. The
  // matching lives in lib/nav-search.ts, SHARED with the top-bar
  // search (dashboard follow-up, 18 Nov 2026): one index, one
  // matcher, two surfaces — see tests/dashboard-followup.test.ts
  // for the matching unit tests.
  assert.match(sidebar, /const hits = searchNavItems\(navItems, query\);/);
  assert.match(sidebar, /import \{ searchNavItems, type NavItemNode \} from '@\/lib\/nav-search';/);
  assert.match(sidebar, /No pages found/);
  assert.match(sidebar, /No pages match/);
  // Search sits immediately below the profile/name section.
  assert.ok(
    sidebar.indexOf('Global sidebar search') < sidebar.indexOf('Navigation: the passed navItems only'),
    'search must render between the profile section and the nav list',
  );
});

test('search: keyboard — arrows move, Enter navigates, Esc clears/closes (⌘K lives in PortalLayout)', () => {
  assert.match(sidebar, /e\.key === 'ArrowDown'/);
  assert.match(sidebar, /e\.key === 'ArrowUp'/);
  assert.match(sidebar, /e\.key === 'Enter'/);
  assert.match(sidebar, /router\.push\(target\.item\.href\)/);
  assert.match(sidebar, /e\.key === 'Escape'/);
  assert.match(sidebar, /⌘K/);
  assert.match(sidebar, /aria-activedescendant/);
  // ⌘K moved to PortalLayout (dashboard follow-up, 18 Nov 2026):
  // one owner for the two search surfaces — the sidebar answers via
  // the focusSearchSignal prop instead of listening itself.
  assert.doesNotMatch(sidebar, /\(e\.metaKey \|\| e\.ctrlKey\) && e\.key\.toLowerCase\(\) === 'k'/);
  assert.match(sidebar, /focusSearchSignal\?: number;/);
});

test('search: the collapsed search icon expands the rail and focuses the input', () => {
  assert.match(sidebar, /aria-label="Search pages"/);
  assert.match(sidebar, /handleSearchIconClick/);
  assert.match(sidebar, /setFocusSearchAfterExpand\(true\)/);
  assert.match(sidebar, /searchInputRef\.current\?\.focus\(\)/);
});

// ---------------------------------------------------------------------------
// 4. Effects — gliding highlight, tooltips, badges, reduced motion
// ---------------------------------------------------------------------------

test('highlight: a single layoutId pill rests on the active row and glides to the hovered row', () => {
  assert.match(sidebar, /layoutId="sidebar-nav-highlight"/);
  assert.match(sidebar, /highlightedHref/);
  // Active row when idle, hovered row on hover, keyboard-selected
  // result while searching.
  assert.match(sidebar, /hoveredHref \?\? \(isSearching/);
  assert.match(sidebar, /activeItem\?\.href/);
  // CodeBettle motion (Eman, 20 Nov 2026 — the pill lagged a full
  // row behind the cursor while it moved down the list): the glide
  // is a FAST critically damped spring (stiffness 800, damping 40,
  // mass 0.5 — damping ratio ~1.0, settles in ~0.1s without
  // overshoot), so the pill sits on the hovered row at every step.
  // Still no bounce, no expo curve — fast, not snappy.
  assert.match(sidebar, /stiffness: 800, damping: 40, mass: 0\.5/);
});

test('highlight: the hovered row lights up instantly, before the pill arrives', () => {
  // The row under the cursor carries its own instant hover
  // background (Eman, 20 Nov 2026 — the hover must read as
  // responsive even while the pill is still gliding). The pill
  // (absolute inset-0) covers it once it arrives.
  assert.match(sidebar, /hover:bg-dark-border\/40/);
});

test('motion character: house 0.45s ease-out everywhere, never the video expo curve', () => {
  assert.match(sidebar, /const MOTION_DURATION = 0\.45/);
  assert.match(sidebar, /const EASE_OUT = 'easeOut'/);
  assert.match(sidebar, /duration: MOTION_DURATION, ease: EASE_OUT/);
  assert.doesNotMatch(sidebar, /0\.22, 1, 0\.36, 1/);
  assert.doesNotMatch(portalLayout, /cubic-bezier\(0\.22,1,0\.36,1\)/);
});

test('tooltips: portaled to document.body on collapsed hover, with an accessible name', () => {
  assert.match(sidebar, /createPortal\(/);
  assert.match(sidebar, /role="tooltip"/);
  assert.match(sidebar, /getBoundingClientRect\(\)/);
  // Tooltips only exist in the collapsed rail; expanded rows already
  // show their label.
  assert.match(sidebar, /if \(!effectiveCollapsed\) return;/);
});

test('badges: count pill expanded, dot on the icon collapsed (9+ cap kept)', () => {
  assert.match(sidebar, /rounded-full bg-primary ring-2 ring-dark-card/);
  assert.match(sidebar, /bg-primary text-ink text-\[11px\] font-bold rounded-full/);
});

test('reduced motion: width, stagger, highlight and arrow all go instant', () => {
  assert.match(sidebar, /useReducedMotion\(\)/);
  assert.match(portalLayout, /useReducedMotion\(\)/);
  assert.match(portalLayout, /!reduceMotion && 'transition-\[width\]/);
  assert.match(sidebar, /reduceMotion \? \{ duration: 0 \} : \{ duration: MOTION_DURATION, ease: EASE_OUT \}/);
});

test('glass: subtle dark-card translucency + blur on the aside, no new colour scheme', () => {
  assert.match(portalLayout, /bg-dark-card\/85/);
  assert.match(portalLayout, /backdrop-blur-xl/);
  assert.doesNotMatch(portalLayout, /from-amber|from-orange|from-rose/);
});

// ---------------------------------------------------------------------------
// 5. Mobile drawer + no loss of functionality
// ---------------------------------------------------------------------------

test('mobile: the drawer is always expanded, has a close button, and auto-closes on nav', () => {
  assert.match(sidebar, /mobile \? false : collapsed/);
  assert.match(sidebar, /aria-label="Close menu"/);
  assert.match(sidebar, /if \(mobile\) onClose\(\)/);
  // The collapse toggle is desktop-only — the mobile branch renders
  // the logo + close button, never the toggle.
  const mobileBranch = sidebar.slice(
    sidebar.indexOf('{mobile ? ('),
    sidebar.indexOf(') : effectiveCollapsed ? ('),
  );
  assert.ok(mobileBranch.length > 100, 'mobile header branch must exist');
  assert.doesNotMatch(mobileBranch, /handleToggle/);
  assert.doesNotMatch(mobileBranch, /Collapse sidebar/);
});

test('no loss: Sign Out, portal switcher, bell, UserMenu, BackButton and view-as all survive', () => {
  assert.match(sidebar, /Sign Out/);
  assert.match(sidebar, /onClick=\{onLogout\}/);
  assert.match(portalLayout, /getPortalSwitch\(user, pathname, adminBasePath, hasTeamAccess\)/);
  assert.match(portalLayout, /<NotificationBadge \/>/);
  assert.match(portalLayout, /<UserMenu/);
  assert.match(portalLayout, /<BackButton inline \/>/);
  assert.match(portalLayout, /<LoginNotificationPopup \/>/);
  // View-as is untouched: the guards live in the server layouts.
  assert.match(studentLayout, /viewAs/);
  assert.match(adminLayout, /viewAs/);
});

// ---------------------------------------------------------------------------
// 5b. Dark+gold sidebar revision (Eman, 21 Nov 2026 — after the
// V32-exact orange/wood preview was rejected: no orange, dashboards
// stay CodeBettle dark+gold; greeting kept as-is)
// ---------------------------------------------------------------------------

test('dark+gold header: the actual CodeBettle logo (not the text), shorter header', () => {
  // Same logo source as the navbar: the navbarLogoUrl setting via
  // the root layout's NavConfigProvider, same default URL.
  assert.match(sidebar, /import \{ useNavConfig \} from '@\/components\/layout\/NavConfigProvider';/);
  assert.match(sidebar, /import \{ DEFAULT_LOGO_URL \} from '@\/components\/layout\/Navbar';/);
  assert.match(sidebar, /const serverConfig = useNavConfig\(\);/);
  assert.match(sidebar, /serverConfig\?\.logoUrl \?\? DEFAULT_LOGO_URL/);
  // The logo image (h-7) replaces the "CodeBettle" gradient text in
  // both the expanded and the mobile header; the text survives only
  // as the onError fallback.
  assert.match(sidebar, /<Image\s+src=\{logoUrl\}\s+alt="CodeBettle"/);
  assert.match(sidebar, /className="h-7 w-auto"/);
  assert.match(sidebar, /onError=\{\(\) => setLogoFailed\(true\)\}/);
  assert.doesNotMatch(sidebar, /<Link href="\/" className="text-xl font-black gradient-text">\s*CodeBettle\s*<\/Link>/);
  assert.match(sidebar, /<span className="text-xl font-black gradient-text">CodeBettle<\/span>/);
  // The header area is shorter (py-3, was py-5); the collapsed rail
  // keeps its "C" badge — no logo there.
  assert.match(sidebar, /'flex items-center border-b border-dark-border py-3',/);
  assert.doesNotMatch(sidebar, /'flex items-center border-b border-dark-border py-5',/);
  assert.match(sidebar, /className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-base font-black text-ink"/);
});

test('dark+gold clock: live time above Sign Out, SMALLER than the V32 preview', () => {
  assert.match(sidebar, /toLocaleTimeString/);
  assert.match(sidebar, /hour12: false/);
  assert.match(sidebar, /setInterval\(\(\) => setNow\(new Date\(\)\), 30_000\)/);
  assert.match(sidebar, /useState<Date \| null>\(null\)/);
  // Smaller than the preview (time text-lg, date 11px, px-6 pt-3).
  assert.match(sidebar, /className="text-base font-bold tabular-nums leading-none text-primary-text"/);
  assert.doesNotMatch(sidebar, /className="text-lg font-bold tabular-nums leading-none text-primary-text"/);
  assert.match(sidebar, /className="mt-0\.5 text-\[10px\] text-muted"/);
  assert.match(sidebar, /className="border-t border-dark-border px-4 pb-1 pt-2"/);
  // Expanded rail only, mount-gated (no hydration mismatch).
  assert.match(sidebar, /\{!effectiveCollapsed && now && \(/);
});

test('dark+gold sign out: shorter HEIGHT only, width unchanged', () => {
  // Button py-2.5 -> py-1.5; still full width (w-full), still px-3
  // expanded. Container py-4 -> py-3.
  assert.match(sidebar, /relative flex w-full cursor-pointer items-center gap-3 rounded-lg py-1\.5 text-sm font-medium text-muted/);
  assert.doesNotMatch(sidebar, /relative flex w-full cursor-pointer items-center gap-3 rounded-lg py-2\.5 text-sm font-medium text-muted/);
  assert.match(sidebar, /className=\{cn\('px-3 py-3', effectiveCollapsed \|\| !now \? 'border-t border-dark-border' : ''\)\}/);
});

test('dark+gold: no orange, no wood anywhere in the dashboard shell', () => {
  // The V32-exact palette was rejected 21 Nov ("ye orange color nh
  // chahy") — the dashboard stays CodeBettle dark+gold. No .v32
  // scope class, no video orange, no wood gradient.
  assert.doesNotMatch(portalLayout, /v32/);
  assert.doesNotMatch(sidebar, /v32/);
  assert.doesNotMatch(sidebar, /#FF6B00/);
  assert.doesNotMatch(portalLayout, /#FF6B00/);
  assert.doesNotMatch(sidebar, /#4A2E1B/);
});

// ---------------------------------------------------------------------------
// 6. No nav mixing — each portal renders only its own routes
// ---------------------------------------------------------------------------

function hrefsIn(source: string): string[] {
  return [...source.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
}

test('no nav mixing: student nav contains only /student/* hrefs', () => {
  const hrefs = hrefsIn(studentLayout);
  assert.ok(hrefs.length >= 12, `student nav must list its items (found ${hrefs.length})`);
  for (const href of hrefs) {
    assert.ok(href.startsWith('/student/'), `student nav must not contain ${href}`);
  }
  assert.doesNotMatch(studentLayout, /href: '\/admin\//);
  assert.doesNotMatch(studentLayout, /href: '\/instructor\//);
  assert.doesNotMatch(studentLayout, /href: '\/team\//);
});

test('no nav mixing: instructor nav contains only /instructor/* hrefs (+ the documented ambassador exception)', () => {
  const hrefs = hrefsIn(instructorLayout);
  assert.ok(hrefs.length >= 11, `instructor nav must list its items (found ${hrefs.length})`);
  for (const href of hrefs) {
    assert.ok(
      href.startsWith('/instructor/') || href === '/student/ambassador',
      `instructor nav must not contain ${href}`,
    );
  }
  assert.doesNotMatch(instructorLayout, /href: '\/admin\//);
  assert.doesNotMatch(instructorLayout, /href: '\/team\//);
});

test('no nav mixing: team nav contains only /team/* hrefs', () => {
  const hrefs = hrefsIn(teamLayout);
  assert.ok(hrefs.length >= 7, `team nav must list its items (found ${hrefs.length})`);
  for (const href of hrefs) {
    assert.ok(href.startsWith('/team/'), `team nav must not contain ${href}`);
  }
  assert.doesNotMatch(teamLayout, /href: '\/admin\//);
  assert.doesNotMatch(teamLayout, /href: '\/student\//);
  assert.doesNotMatch(teamLayout, /href: '\/instructor\//);
});

test('no nav mixing: admin nav is built from ADMIN_AREAS with the permission filter, never another portal', () => {
  assert.match(adminLayout, /hasAdminArea\(permissions, area\.key\)/);
  assert.match(adminLayout, /ADMIN_AREAS/);
  assert.doesNotMatch(adminLayout, /href: '\/student\//);
  assert.doesNotMatch(adminLayout, /href: '\/instructor\//);
  assert.doesNotMatch(adminLayout, /href: '\/team\//);
});

test('one implementation: no second sidebar component exists anywhere', () => {
  // PortalLayout no longer defines its own Sidebar — the only
  // sidebar implementation is CollapsibleSidebar.
  assert.doesNotMatch(portalLayout, /function Sidebar\(/);
  assert.match(portalLayout, /import CollapsibleSidebar from '@\/components\/layout\/CollapsibleSidebar'/);
});
