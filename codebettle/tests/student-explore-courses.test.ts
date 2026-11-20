/**
 * Explore New Courses + Join New Course + theme toggle location
 * (Eman, 15 Nov 2026 — moved into Profile settings; 20 Nov 2026 —
 * moved OUT again into the avatar dropdown, see section 4).
 *
 * A student who finished their courses had no way to enrol in another
 * one without leaving for the landing page. The portal now has an
 * "Explore New Courses" nav item directly above "My Courses" listing
 * every published course, a "Join New Course" button at the top-right
 * of My Courses, and the dark/light toggle lives in the avatar
 * dropdown (UserMenu) — same cookie-based theme, only the location
 * changed (it was in Profile settings 15–20 Nov 2026, removed because
 * its long text overflowed and its floating menu overlapped Change
 * Password).
 *
 * Pages/layouts are server/client components that cannot be rendered
 * in node, so the wiring is asserted by source inspection, following
 * the Phase 6 design-test pattern (tests/phase6-design.test.ts).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const studentLayout = read('app/student/layout.tsx');
const explorePage = read('app/student/explore/page.tsx');
const enrollButton = read('app/student/explore/explore-enroll-button.tsx');
const myCoursesPage = read('app/student/courses/page.tsx');
const studentProfile = read('app/student/profile/page.tsx');
const portalLayout = read('components/layout/PortalLayout.tsx');
const navbar = read('components/layout/Navbar.tsx');
const instructorLayout = read('app/instructor/layout.tsx');
const adminLayout = read('app/admin/layout.tsx');

// ---------------------------------------------------------------------------
// 1. Sidebar: "Explore New Courses" directly above "My Courses"
// ---------------------------------------------------------------------------

test('student sidebar has "Explore New Courses" directly above "My Courses"', () => {
  const exploreHrefIdx = studentLayout.indexOf("href: '/student/explore'");
  const myCoursesHrefIdx = studentLayout.indexOf("href: '/student/courses'");
  assert.ok(exploreHrefIdx > 0, 'Explore New Courses nav item is missing');
  assert.ok(myCoursesHrefIdx > 0, 'My Courses nav item is missing');
  assert.ok(exploreHrefIdx < myCoursesHrefIdx, 'Explore New Courses must sit above My Courses');
  // Nothing between them: the next nav entry after Explore must be
  // My Courses.
  const between = studentLayout.slice(exploreHrefIdx + "href: '/student/explore'".length, myCoursesHrefIdx);
  assert.ok(!between.includes("href: '/student/"), 'another nav item sits between Explore and My Courses');
  assert.ok(
    studentLayout.includes("label: 'Explore New Courses'"),
    'Explore item label is missing',
  );
  // Same nav-item shape as the other entries (icon + label).
  assert.ok(
    studentLayout.includes("label: 'Explore New Courses', icon: <Compass"),
    'Explore item must carry an icon like the other nav items',
  );
});

// ---------------------------------------------------------------------------
// 2. Explore page: all published courses + enrolled state + same enrol path
// ---------------------------------------------------------------------------

test('Explore page lists all published courses with enrolled state', () => {
  assert.ok(explorePage.includes('getPublishedCourses'), 'must fetch every published course');
  assert.ok(explorePage.includes('getEnrollmentsByStudent'), 'must know which courses the student already has');
  assert.ok(explorePage.includes('Explore New Courses'), 'page heading is missing');
  // Enrolled courses show their state instead of an Enrol button.
  assert.ok(explorePage.includes('Payment pending'), 'pending enrolments must be labelled');
  assert.ok(explorePage.includes('Continue Learning'), 'enrolled courses must link back to the course');
  assert.ok(
    explorePage.includes("href={`/student/courses/${course.id}`}"),
    'enrolled state must link to the student course page',
  );
  // Not-enrolled courses get the enrol button; the list is the full
  // published catalogue (no filtering to un-enrolled only).
  assert.ok(explorePage.includes('<ExploreEnrollButton'), 'not-enrolled courses need the enrol button');
});

test('Explore enrol reuses the existing enrolment endpoint (no second path)', () => {
  assert.ok(
    enrollButton.includes("fetch('/api/student/enrollments'"),
    'must POST to the same /api/student/enrollments endpoint as the public course page',
  );
  assert.ok(
    enrollButton.includes('body: JSON.stringify({ courseId })'),
    'must send only the courseId — the server resolves the open batch and sets paymentStatus itself',
  );
  // Duplicate enrolment (409) goes to the course, exactly like the
  // public flow.
  assert.ok(enrollButton.includes('res.status === 409'), '409 duplicate must be handled');
  assert.ok(
    enrollButton.includes("`/student/courses/${courseId}`"),
    'after enrol (or 409) the student lands on their course page',
  );
  assert.ok(
    enrollButton.includes("paymentStatus === 'pending'"),
    'pending vs free toast must match the public enrol flow',
  );
});

// ---------------------------------------------------------------------------
// 3. My Courses: "Join New Course" button, top-right
// ---------------------------------------------------------------------------

test('My Courses page has a "Join New Course" button at the top-right', () => {
  assert.ok(myCoursesPage.includes('Join New Course'), 'button label is missing');
  assert.ok(
    myCoursesPage.includes('href="/student/explore"'),
    'button must link to the Explore page',
  );
  // Top-right: the button sits in the header flex row (justify-between)
  // next to the title, not down in the list or the empty state.
  const headerIdx = myCoursesPage.indexOf('flex items-start justify-between');
  assert.ok(headerIdx > 0, 'header flex row is missing');
  const headerBlock = myCoursesPage.slice(headerIdx, myCoursesPage.indexOf('</FadeIn>', headerIdx));
  assert.ok(headerBlock.includes('Join New Course'), 'button must be in the header row');
  assert.ok(headerBlock.includes('<h1'), 'title must share the header row');
  // Empty state points at the in-portal Explore page too.
  assert.ok(
    myCoursesPage.includes('Explore New Courses →'),
    'empty-state link must point students to Explore',
  );
});

// ---------------------------------------------------------------------------
// 4. Theme toggle: OUT of Profile settings, INTO the avatar dropdown
// ---------------------------------------------------------------------------

test('student Profile settings has NO Appearance section — theme lives in the avatar dropdown', () => {
  // Eman, 20 Nov 2026: the Appearance section (long overflowing
  // paragraph + floating ThemeToggle menu overlapping Change Password)
  // was removed from Profile settings; the theme control now lives in
  // the avatar dropdown (UserMenu), next to Logout.
  assert.doesNotMatch(studentProfile, /Appearance/);
  assert.doesNotMatch(studentProfile, /ThemeToggle/);
  assert.doesNotMatch(studentProfile, /click the icon to switch/);
  assert.doesNotMatch(studentProfile, /Choose how the website looks/);
  // The page is unchanged otherwise: Personal Info + Change Password
  // are still there, in the same order, with no gap left behind.
  assert.match(studentProfile, /Personal Info/);
  assert.match(studentProfile, /Change Password/);
  assert.ok(
    studentProfile.indexOf('Personal Info') < studentProfile.indexOf('Change Password'),
    'Personal Info must come before Change Password',
  );
});

test('avatar dropdown carries the compact theme control (UserMenu, above Logout)', () => {
  const userMenu = read('components/layout/UserMenu.tsx');
  assert.match(userMenu, /import ThemeMenuRow from '@\/components\/theme\/ThemeMenuRow'/);
  assert.match(userMenu, /<ThemeMenuRow \/>/);
  // The row sits above the Logout button, after the divider that
  // follows Settings. (The word "Logout" also appears in the file
  // header comment, so pin the button itself via its onLogout call.)
  const rowIdx = userMenu.indexOf('<ThemeMenuRow />');
  const logoutBtnIdx = userMenu.indexOf('void onLogout()');
  assert.ok(rowIdx > 0 && logoutBtnIdx > 0 && rowIdx < logoutBtnIdx, 'theme row must sit above Logout');
});

test('portal top bar hides the toggle only for the student portal', () => {
  assert.ok(
    portalLayout.includes('hideThemeToggle?: boolean'),
    'PortalLayout must accept the hideThemeToggle prop',
  );
  assert.ok(
    portalLayout.includes('{!hideThemeToggle && <ThemeToggle />}'),
    'top-bar toggle must render only when not hidden',
  );
  assert.ok(
    studentLayout.includes('hideThemeToggle'),
    'student layout must hide the top-bar toggle',
  );
  // Instructor/admin portals keep their top-bar toggle (default false).
  assert.ok(!instructorLayout.includes('hideThemeToggle'), 'instructor portal must keep its toggle');
  assert.ok(!adminLayout.includes('hideThemeToggle'), 'admin portal must keep its toggle');
});

test('public navbar keeps its theme toggle (logged-out visitors)', () => {
  // The navbar toggle is the ONLY theme control on public pages and
  // for logged-out visitors — it must stay exactly where it is.
  const count = (navbar.match(/<ThemeToggle \/>/g) ?? []).length;
  assert.ok(count >= 1, 'navbar must keep its ThemeToggle');
  assert.ok(
    navbar.includes("import ThemeToggle from '@/components/theme/ThemeToggle'"),
    'navbar must still import ThemeToggle',
  );
});
