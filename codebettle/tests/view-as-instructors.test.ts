// View-as moved: "Switch to Teacher Portal" lives on the Instructors
// page (one Switch button per teacher card), NOT on the Applications
// page — and there is NO time limit (Eman, 16 Nov 2026: the ADM-02
// 30-minute TTL is removed).
//
// Tested with renderToStaticMarkup (InstructorsClient uses hooks, so it
// is rendered via createElement, not called as a plain function — same
// pattern as tests/user-menu.test.ts). There is NO jsdom here, so the
// click-to-open flow is not DOM-tested: the POST to /api/admin/view-as
// and the redirect to /instructor/dashboard are asserted from source
// below. A live-browser check of the Switch button is still to be done
// separately — static markup proves the structure, not the interaction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import InstructorsClient from '../app/admin/instructors/instructors-client';
import type { SafeUser } from '../lib/db/types';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const activeTeacher: SafeUser = {
  id: 'teacher-1',
  name: 'Tea Cher',
  email: 'teacher@example.com',
  role: 'instructor',
  isAdmin: false,
  isTeacher: true,
  canViewAuditLog: false,
  status: 'active',
  joinedAt: '2026-01-01',
  avatar: '',
  expertise: ['React'],
};

const suspendedTeacher: SafeUser = {
  ...activeTeacher,
  id: 'teacher-2',
  name: 'Sus Pended',
  email: 'suspended@example.com',
  status: 'suspended',
};

function renderInstructors(): string {
  return renderToStaticMarkup(
    createElement(InstructorsClient, {
      instructors: [activeTeacher, suspendedTeacher],
      courseCounts: {},
      coursesByInstructor: {},
      allCourses: [],
    }),
  );
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

test('instructors page: one Switch button per ACTIVE teacher card, none for suspended', () => {
  const markup = renderInstructors();
  // Both teachers render.
  assert.ok(markup.includes('Tea Cher'));
  assert.ok(markup.includes('Sus Pended'));
  // Exactly one Switch button — the active teacher's card. The
  // suspended teacher has no button (the service refuses suspended
  // teachers, so a button there would only ever error).
  assert.equal(countOccurrences(markup, 'Switch to Teacher Portal'), 1);
  // The pre-existing per-card controls are untouched.
  assert.ok(markup.includes('View'));
  assert.ok(markup.includes('Assign Course'));
});

test('instructors Switch button mints view-as and lands on the teacher dashboard', () => {
  const src = read('app/admin/instructors/instructors-client.tsx');
  assert.ok(src.includes("fetch('/api/admin/view-as'"));
  assert.ok(src.includes("window.location.href = '/instructor/dashboard'"));
});

test('applications page no longer has any view-as button or code', () => {
  const src = read('app/admin/applications/page.tsx');
  assert.ok(!src.includes('Switch to Teacher Portal'));
  assert.ok(!src.includes('handleViewAs'));
  assert.ok(!src.includes('/api/admin/view-as'));
  assert.ok(!src.includes('onboardedIds'));
  assert.ok(!src.includes('loadOnboardedState'));
});

test('view-as has NO time limit (Eman, 16 Nov 2026 — ADM-02 TTL removed): no expiry constant, session cookie (no maxAge)', () => {
  const libSrc = read('lib/view-as.ts');
  assert.ok(!libSrc.includes('VIEW_AS_TTL_MS'));
  assert.ok(!libSrc.includes('30 * 60 * 1000'));
  assert.ok(!libSrc.includes('expiresAt: number'));
  const routeSrc = read('app/api/admin/view-as/route.ts');
  // The cookie stays a browser-session cookie (no max-age); there is
  // no token expiry left to enforce server-side.
  assert.ok(!routeSrc.includes('maxAge'));
  assert.ok(!routeSrc.includes('expiresAt'));
  // The token expiry behaviour itself is covered in
  // tests/view-as-extension.test.ts (no-expiry: a minted token
  // verifies, and startViewAs returns no expiry).
});

test('view-as banner returns to the entry page (Instructors by default; Ambassadors for ambassador view-as)', () => {
  const src = read('components/layout/ViewAsBanner.tsx');
  // PR #33: the return URL uses the secret admin base path (default
  // 'admin', so the live URL is still /admin/instructors in dev).
  // The 16 Nov 2026 extension parameterised the destination:
  // returnPath defaults to 'instructors' (teacher view-as) and the
  // student layout passes 'ambassadors' for ambassador view-as.
  assert.ok(src.includes('window.location.href = `/${adminBasePath}/${returnPath}`'));
  assert.ok(src.includes("returnPath = 'instructors'"));
  assert.ok(src.includes("adminBasePath = 'admin'"));
  assert.ok(!src.includes("window.location.href = '/admin/applications'"));
});
