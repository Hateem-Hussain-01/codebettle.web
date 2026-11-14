/**
 * Back to Dashboard button in the public navbar (Eman, 14 Nov 2026).
 *
 * A logged-in user on the home page (or any public page) had no
 * visible way back to their dashboard — the avatar UserMenu has no
 * Dashboard link. The navbar now shows a primary "Back to Dashboard"
 * button next to the avatar when a session exists, for all three
 * roles; the mobile menu's "Go to Portal" button is renamed to match.
 *
 * The Navbar is a client component (framer-motion, next/navigation)
 * and cannot be rendered in node, so the wiring is asserted by
 * source inspection, following the Phase 6 design-test pattern
 * (tests/phase6-design.test.ts). The destination itself is unit
 * tested: primaryPortalDashboard returns the right dashboard for
 * every role, and admins go through /api/portal (server-side
 * redirect) so the secret admin base path never appears in the page
 * or the JS bundle.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { primaryPortalDashboard } from '../lib/portal-switch';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

// ---------------------------------------------------------------------------
// Destination: the button's href for every role
// ---------------------------------------------------------------------------

test('primaryPortalDashboard returns the right dashboard for every role', () => {
  assert.equal(primaryPortalDashboard({ role: 'student' }), '/student/dashboard');
  assert.equal(primaryPortalDashboard({ role: 'instructor' }), '/instructor/dashboard');
  // Admins never get a direct path — the navbar routes them through
  // /api/portal instead (see the Navbar source tests below).
  assert.equal(primaryPortalDashboard({ role: 'admin' }), '/admin/dashboard');
  assert.equal(primaryPortalDashboard(null), null);
  assert.equal(primaryPortalDashboard(undefined), null);
  assert.equal(primaryPortalDashboard({ role: 'unknown' }), null);
});

// ---------------------------------------------------------------------------
// Source inspection: components/layout/Navbar.tsx
// ---------------------------------------------------------------------------

const navbar = read('components/layout/Navbar.tsx');

test('desktop navbar shows a "Back to Dashboard" button for logged-in users', () => {
  assert.ok(navbar.includes('Back to Dashboard'), 'button label is missing');
  // Primary (gold) styling, next to the avatar menu, inside the
  // session branch — the button must not appear when logged out.
  const sessionBlock = navbar.slice(navbar.indexOf('{session && menuLinks ? ('));
  assert.ok(sessionBlock.length > 0, 'session branch not found');
  assert.ok(
    sessionBlock.includes('<Button variant="primary" size="sm">Back to Dashboard</Button>'),
    'desktop button is not a primary button in the session branch',
  );
  // The button comes before the avatar menu in the same branch.
  assert.ok(
    sessionBlock.indexOf('Back to Dashboard') < sessionBlock.indexOf('<UserMenu'),
    'button must sit next to (before) the avatar UserMenu',
  );
  // It links to the existing portalLink — no new URL is built here.
  assert.ok(
    sessionBlock.includes('<Link href={portalLink!}>'),
    'button must link to the existing portalLink',
  );
});

test('admin still goes through /api/portal — no secret path in the navbar', () => {
  assert.ok(
    navbar.includes("session?.role === 'admin' ? '/api/portal?to=dashboard'"),
    'admin portalLink must stay the /api/portal server-side redirect',
  );
  assert.ok(!navbar.includes('getAdminBasePath'), 'Navbar must not read the admin base path');
  assert.ok(!navbar.includes('ADMIN_BASE_PATH'), 'Navbar must not reference ADMIN_BASE_PATH');
  assert.ok(!navbar.includes('portal-u2l2szx9i7u6gtpqutpq'), 'secret admin path must never appear in the navbar');
});

test('mobile menu button is renamed to "Back to Dashboard"', () => {
  assert.ok(!navbar.includes('Go to Portal'), '"Go to Portal" wording must be gone');
  const mobileBlock = navbar.slice(navbar.indexOf('{/* Mobile menu */}'));
  assert.ok(mobileBlock.length > 0, 'mobile menu block not found');
  assert.ok(
    mobileBlock.includes('<Button variant="primary" size="sm" fullWidth>Back to Dashboard</Button>'),
    'mobile button must say "Back to Dashboard"',
  );
  assert.ok(
    mobileBlock.includes('<Link href={portalLink!}'),
    'mobile button must link to the same portalLink',
  );
});

test('logged-out navbar is unchanged (Login / Get Started)', () => {
  assert.ok(navbar.includes('>Login</Button>'), 'Login button missing');
  assert.ok(navbar.includes('>Get Started</Button>'), 'Get Started button missing');
  // The logged-out buttons live in the else branch of the same
  // session check — the dashboard button must not leak into it.
  // Bound the slice to the end of that ternary so the mobile menu
  // (which legitimately has its own Back to Dashboard button) is
  // not included.
  const branchStart = navbar.indexOf('<Link href="/auth/login"><Button variant="ghost" size="sm">Login</Button></Link>');
  assert.ok(branchStart > 0, 'logged-out branch not found');
  const branchEnd = navbar.indexOf(')}', branchStart);
  assert.ok(branchEnd > branchStart, 'logged-out branch end not found');
  const loggedOutBlock = navbar.slice(branchStart, branchEnd);
  assert.ok(!loggedOutBlock.includes('Back to Dashboard'), 'dashboard button must not render when logged out');
});

test('BackButton and UserMenu are untouched', () => {
  assert.ok(navbar.includes('<BackButton />'), 'BackButton must still render');
  assert.ok(navbar.includes('<UserMenu'), 'UserMenu must still render');
  const backButton = read('components/layout/BackButton.tsx');
  assert.ok(backButton.includes("pathname === '/'"), 'BackButton must still hide on the home page');
});
