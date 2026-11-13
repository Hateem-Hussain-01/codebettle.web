/**
 * Admin profile page (Worker B) — /admin/profile.
 *
 * The page is a 'use client' component copied from the student profile
 * page pattern (same APIs, same cards, same validation/toasts), with the
 * role badge changed to "Admin". There is no jsdom in this repo, so the
 * render check uses renderToStaticMarkup: effects never run, so the page
 * renders its loading state. The page calls useRouter() during render,
 * which throws without a mounted App Router, so the render is wrapped in
 * Next's AppRouterContext with a stub router (refresh only — the only
 * router method the page's handlers call, and handlers never run here).
 * Behaviour wiring (API paths, validation, nav item, gate) is asserted by
 * source inspection, following the Phase 6 / portal-switch test pattern.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import AdminProfilePage from '../app/admin/profile/page';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const pageSrc = read('app/admin/profile/page.tsx');
const layoutSrc = read('app/admin/layout.tsx');

// ---------------------------------------------------------------------------
// Render — loading state, no hardcoded user data
// ---------------------------------------------------------------------------

test('render: admin profile page renders the loading state with no hardcoded user data', () => {
  // Stub router: the page only calls router.refresh() in event handlers,
  // which never run during static rendering.
  const stubRouter = { refresh: () => {} };
  const html = renderToStaticMarkup(
    React.createElement(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      AppRouterContext.Provider as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { value: stubRouter as any },
      React.createElement(AdminProfilePage),
    ),
  );
  assert.match(html, /Loading your profile…/);
  // No user data is rendered before the real profile loads: no name,
  // no email, no seeded/demo identity of any kind.
  assert.doesNotMatch(html, /@/);
  assert.doesNotMatch(html, /demo|seed|test user|john doe|jane doe/i);
  // The role badge and the form only appear after the profile loads.
  assert.doesNotMatch(html, /Admin<\/span>/);
  assert.doesNotMatch(html, /Student<\/span>/);
  assert.doesNotMatch(html, /Change Password/);
});

// ---------------------------------------------------------------------------
// Source guards — the page reuses the existing profile APIs only
// ---------------------------------------------------------------------------

test('page: loads and saves via GET + PATCH /api/profile, avatar via POST /api/profile/avatar', () => {
  assert.match(pageSrc, /fetch\('\/api\/profile', \{ cache: 'no-store' \}\)/);
  assert.match(pageSrc, /fetch\('\/api\/profile', \{\s*method: 'PATCH'/);
  assert.match(pageSrc, /fetch\('\/api\/profile\/avatar', \{ method: 'POST', body: form \}\)/);
});

test('page: password change posts to /api/auth with action change-password', () => {
  assert.match(pageSrc, /fetch\('\/api\/auth', \{\s*method: 'POST'/);
  assert.match(pageSrc, /action: 'change-password'/);
});

test('page: no fetch to any other API path, no new route or model reference', () => {
  const fetched = [...pageSrc.matchAll(/fetch\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(fetched)].sort(),
    ['/api/auth', '/api/profile', '/api/profile/avatar'],
  );
  assert.doesNotMatch(pageSrc, /prisma/i);
  assert.doesNotMatch(pageSrc, /\/api\/(?!profile|auth)/);
  assert.doesNotMatch(pageSrc, /from '@\/lib\/(db|prisma)/);
});

test('page: role badge says Admin, same heading and subtitle as the student page', () => {
  assert.match(pageSrc, />Admin<\/span>/);
  assert.doesNotMatch(pageSrc, />Student<\/span>/);
  assert.match(pageSrc, /My Profile/);
  assert.match(pageSrc, /Manage your account details/);
});

test('page: same validation and toasts as the student page', () => {
  assert.match(pageSrc, /toast\.error\('Name is required'\)/);
  assert.match(pageSrc, /toast\.error\('New passwords do not match'\)/);
  assert.match(pageSrc, /toast\.error\('Password must be at least 8 characters'\)/);
  assert.match(pageSrc, /passwords\.new\.length < 8/);
  assert.match(pageSrc, /toast\.success\('Profile updated successfully!'\)/);
  assert.match(pageSrc, /toast\.success\('Profile photo updated!'\)/);
  assert.match(pageSrc, /toast\.success\('Password changed!'\)/);
});

test('page: no invented fields, no hardcoded user data', () => {
  // The only profile fields are the shared ones: name, email, phone, bio, avatar.
  assert.doesNotMatch(pageSrc, /expertise|website|socials|firstName|lastName/);
  assert.doesNotMatch(pageSrc, /mhateem|hateem|@gmail\.com|@codebettle/i);
  // Email is read-only, exactly like the student page.
  assert.match(pageSrc, /label="Email Address" type="email" value=\{profile\.email\} disabled/);
});

// ---------------------------------------------------------------------------
// Source guards — admin sidebar nav item + unchanged gate
// ---------------------------------------------------------------------------

test('layout: sidebar navItems include a Profile item pointing at /admin/profile', () => {
  // PR #33: nav hrefs are built with adminUrl(), which resolves to the
  // secret base path in production and to /admin in dev.
  assert.match(layoutSrc, /href: adminUrl\('\/profile'\),\s*label: 'Profile',/);
  assert.match(layoutSrc, /import \{[^}]*\bUser\b[^}]*\} from 'lucide-react'/);
  assert.match(layoutSrc, /icon: <User className="w-5 h-5" \/>/);
  // The item is pushed after the ADMIN_AREAS-built list (next to
  // Settings, the last area) — it is NOT a grantable area.
  const builtAt = layoutSrc.indexOf('ADMIN_AREAS.filter');
  const profileAt = layoutSrc.indexOf("href: adminUrl('/profile')");
  const auditAt = layoutSrc.indexOf('if (showAuditNav)');
  assert.ok(builtAt >= 0 && profileAt > builtAt, 'Profile item must come after the ADMIN_AREAS list');
  assert.ok(profileAt < auditAt, 'Profile item must sit before the Audit Log insert');
  assert.doesNotMatch(layoutSrc, /profile: <User/);
});

test('layout: hasAdminCapability gate unchanged, unknown /admin/* paths still left alone', () => {
  // PR #33: a denied/unauthenticated admin visitor goes to the SECRET
  // sign-in page (adminUrl('/signin')), not the public login page.
  assert.match(layoutSrc, /if \(!session \|\| !hasAdminCapability\(session\)\) redirect\(adminUrl\('\/signin'\)\)/);
  assert.ok(
    layoutSrc.indexOf('hasAdminCapability(session)') < layoutSrc.indexOf('<PortalLayout'),
    'gate must run before PortalLayout renders',
  );
  assert.match(layoutSrc, /Unknown \/admin\/\* paths are left alone to 404/);
  // No gating change for the new page: areaForAdminPath is untouched
  // (it now receives the internal path, converted from the secret URL).
  assert.match(layoutSrc, /const area = areaForAdminPath\(internalPath\)/);
});

test('layout: certificate system untouched (pre-existing certificates nav entry unchanged)', () => {
  assert.doesNotMatch(pageSrc, /certificate/i);
  // The certificates sidebar entry predates this change and is untouched.
  assert.match(layoutSrc, /certificates: <Award className="w-5 h-5" \/>/);
});
