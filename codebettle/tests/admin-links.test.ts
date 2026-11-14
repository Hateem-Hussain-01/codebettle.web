// Admin page links must go through the secret admin base path (PR #33).
//
// Live bug (14 Nov 2026): clicking "New Template" in Email Templates
// took the admin to the home page. Root cause: the button did
// router.push('/admin/email-templates/new'), but PR #33 moved the admin
// area to a secret base path and the proxy redirects ALL legacy
// /admin/* page paths home. PR #34 fixed this bug class for the Page
// Builder only (useAdminUrl() hook); the rest of the admin was missed.
// This test pins the fix: no hardcoded /admin/... page link may remain
// in any admin client/server file, and the New Template button (plus the
// other fixed links) must route through the admin URL helper.
//
// Deliberately NOT covered here (they are internal identifiers, not
// page links): lib/admin-access.ts ADMIN_AREAS hrefs (the sidebar
// converts them with toExternalAdminPath), app/admin/layout.tsx
// internal-path guards, lib/admin-url.ts itself, and robots.txt.
// /api/admin fetch calls are API routes and are fine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

/** A quoted string that starts with /admin (a hardcoded page link). /api/admin is allowed. */
const HARDCODED_ADMIN_LINK = /(['"`])\/admin(\/|\?|['"`])/;

/** Every admin client/server file that had a hardcoded page link. */
const FIXED_FILES = [
  'app/admin/communications/communications-client.tsx',
  'app/admin/courses/[id]/page.tsx',
  'app/admin/courses/courses-client.tsx',
  'app/admin/courses/new/new-course-client.tsx',
  'app/admin/email-templates/email-template-editor-client.tsx',
  'app/admin/email-templates/email-templates-client.tsx',
  'app/admin/enrollments/enrollments-client.tsx',
  'app/admin/forms/[id]/builder/builder-client.tsx',
  'app/admin/forms/[id]/submissions/submissions-client.tsx',
  'app/admin/forms/forms-client.tsx',
  'app/admin/notifications/page.tsx',
  'app/admin/requests/[id]/request-detail-client.tsx',
  'app/admin/requests/requests-client.tsx',
  'app/admin/students/import/import-client.tsx',
  'app/admin/students/page.tsx',
  'app/admin/success-stories-management/management-client.tsx',
  'app/admin/success-stories/[id]/success-story-detail-client.tsx',
  'app/admin/success-stories/success-stories-client.tsx',
  'lib/services/notification-service.ts',
];

test('admin links: no hardcoded /admin page link remains in any fixed file', () => {
  for (const rel of FIXED_FILES) {
    const src = read(rel);
    const hit = src.match(HARDCODED_ADMIN_LINK);
    assert.equal(
      hit,
      null,
      `${rel} still has a hardcoded admin page link: ${hit?.[0] ?? ''} — route it through useAdminUrl() (client) or adminUrl() (server)`,
    );
  }
});

test('admin links: Email Templates New Template button routes via the admin URL hook', () => {
  const src = read('app/admin/email-templates/email-templates-client.tsx');
  assert.ok(src.includes("import { useAdminUrl } from '@/components/admin/AdminBasePathContext';"));
  assert.ok(src.includes('const adminUrl = useAdminUrl();'));
  assert.ok(src.includes("router.push(adminUrl('/email-templates/new'))"));
  // The list rows also open the editor through the hook.
  assert.ok(src.includes("router.push(adminUrl(`/email-templates/${template.id}`))"));
});

test('admin links: email-template editor back/cancel/delete routes via the admin URL hook', () => {
  const src = read('app/admin/email-templates/email-template-editor-client.tsx');
  assert.ok(src.includes("import { useAdminUrl } from '@/components/admin/AdminBasePathContext';"));
  assert.ok(src.includes('const adminUrl = useAdminUrl();'));
  assert.ok(src.includes("router.push(adminUrl('/email-templates'))"));
});

test('admin links: server pages use the server-side adminUrl helper', () => {
  const coursePage = read('app/admin/courses/[id]/page.tsx');
  assert.ok(coursePage.includes("import { adminUrl } from '@/lib/admin-url';"));
  assert.ok(coursePage.includes('href={adminUrl("/courses")}'));
  const notificationsPage = read('app/admin/notifications/page.tsx');
  assert.ok(notificationsPage.includes("import { adminUrl } from '@/lib/admin-url';"));
  assert.ok(notificationsPage.includes('href={adminUrl("/notifications/compose")}'));
});

test('admin links: form-submission admin notification links via the server-side adminUrl helper', () => {
  const src = read('lib/services/notification-service.ts');
  assert.ok(src.includes("import { adminUrl } from '../admin-url';"));
  assert.ok(src.includes("linkUrl: adminUrl('/forms')"));
});

test('admin links: every fixed client file imports and calls the admin URL hook', () => {
  const clients = FIXED_FILES.filter(
    (f) => f.endsWith('-client.tsx') || f === 'app/admin/students/page.tsx',
  );
  for (const rel of clients) {
    const src = read(rel);
    assert.ok(
      src.includes("import { useAdminUrl } from '@/components/admin/AdminBasePathContext';"),
      `${rel} does not import useAdminUrl`,
    );
    assert.ok(src.includes('const adminUrl = useAdminUrl();'), `${rel} does not call useAdminUrl`);
  }
});
