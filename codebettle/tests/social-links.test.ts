import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { GET as listLinks, POST as createLink } from '../app/api/admin/social-links/route';
import { PATCH as updateLink, DELETE as deleteLink } from '../app/api/admin/social-links/[id]/route';
import { GET as publicLinks } from '../app/api/social-links/route';
import { listEnabledSocialLinks, listSocialLinks } from '../lib/db/social-links';
import { getAuditLog } from '../lib/db/audit';
import type { SessionUser } from '../lib/services/auth-service';
import {
  defaultSocialLinks,
  isValidSocialUrl,
  resolveFooterLinks,
  resolvePlatformKey,
} from '../lib/social';

/**
 * Phase 4, Module 7 — admin-managed footer social icons.
 * DB-backed SocialLink CRUD under Settings (requireAdminArea('settings')
 * + manageSettings capability), a public enabled-only read for the
 * footer, and the shared-source resolution rules (defaults when no
 * rows, enabled-only when rows exist). No X/Twitter, no YouTube.
 */

const D = (s: string) => new Date(s);
const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };
// Restricted admin: granted only the courses area, NOT settings.
const RESTRICTED_ADMIN: SessionUser = {
  id: 'admin-2', name: 'Restricted', email: 'restricted@codebettle.com', role: 'admin',
  adminPermissions: { courses: true },
};
const STUDENT: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };

let fake: FakeDb;

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const LINKEDIN_BODY = {
  name: 'LinkedIn',
  url: 'https://www.linkedin.com/company/codebettle/',
  displayOrder: 0,
};

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'admin-2', name: 'Restricted', email: 'restricted@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

// ---------------------------------------------------------------------------
// Shared source: resolution rules (lib/social.ts)
// ---------------------------------------------------------------------------

test('defaults: six verified platforms, no X/Twitter, no YouTube', () => {
  const defaults = defaultSocialLinks();
  assert.deepEqual(
    defaults.map((d) => d.key),
    ['whatsapp', 'facebook', 'instagram', 'linkedin', 'github', 'email'],
  );
  assert.ok(defaults.every((d) => d.url && !d.url.includes('#')));
  assert.equal(defaults.find((d) => d.key === 'github')?.url, 'https://github.com/Hateem-Hussain-01');
  assert.equal(defaults.find((d) => d.key === 'whatsapp')?.url, 'https://wa.me/923055261893');
  assert.equal(defaults.find((d) => d.key === 'email')?.url, 'mailto:info@codebettle.com');
});

test('resolveFooterLinks: no rows -> defaults; rows -> enabled only, in display order', () => {
  assert.deepEqual(resolveFooterLinks([]), defaultSocialLinks());
  assert.deepEqual(resolveFooterLinks(null), defaultSocialLinks());
  assert.deepEqual(resolveFooterLinks(undefined), defaultSocialLinks());

  const resolved = resolveFooterLinks([
    { name: 'GitHub', url: 'https://github.com/Hateem-Hussain-01', displayOrder: 2 },
    { name: 'LinkedIn', url: 'https://www.linkedin.com/company/codebettle/', displayOrder: 1 },
    { name: 'Instagram', url: 'https://www.instagram.com/codebettle', displayOrder: 0, isEnabled: false },
    { name: 'Facebook', url: '  ', displayOrder: 0 },
  ]);
  assert.deepEqual(
    resolved.map((r) => r.label),
    ['LinkedIn', 'GitHub'],
  );
  assert.equal(resolved[0].key, 'linkedin');
  assert.equal(resolved[1].key, 'github');
});

test('resolvePlatformKey: names map to icons; X/Twitter is unknown, never a brand mark', () => {
  assert.equal(resolvePlatformKey('LinkedIn'), 'linkedin');
  assert.equal(resolvePlatformKey('  linked in '), 'linkedin');
  assert.equal(resolvePlatformKey('GitHub'), 'github');
  assert.equal(resolvePlatformKey('WhatsApp'), 'whatsapp');
  assert.equal(resolvePlatformKey('E-mail'), 'email');
  assert.equal(resolvePlatformKey('X'), 'unknown');
  assert.equal(resolvePlatformKey('Twitter'), 'unknown');
  assert.equal(resolvePlatformKey('YouTube'), 'unknown');
  assert.equal(resolvePlatformKey('TikTok'), 'unknown');
});

test('isValidSocialUrl: https/http + mailto only', () => {
  assert.equal(isValidSocialUrl('https://www.linkedin.com/company/codebettle/'), true);
  assert.equal(isValidSocialUrl('mailto:info@codebettle.com'), true);
  assert.equal(isValidSocialUrl('javascript:alert(1)'), false);
  assert.equal(isValidSocialUrl('/relative/path'), false);
  assert.equal(isValidSocialUrl('ftp://example.com/x'), false);
  assert.equal(isValidSocialUrl('not a url'), false);
  assert.equal(isValidSocialUrl('mailto:not-an-email'), false);
});

// ---------------------------------------------------------------------------
// Admin CRUD + RBAC
// ---------------------------------------------------------------------------

test('admin CRUD: create (201) -> list -> PATCH edit/disable -> DELETE, with audit entries', async () => {
  __setTestSession(ADMIN);

  const created = await createLink(jsonReq('http://localhost/api/admin/social-links', 'POST', LINKEDIN_BODY));
  assert.equal(created.status, 201);
  const createdBody = await created.json() as { link: { id: string; name: string; url: string; isEnabled: boolean } };
  assert.equal(createdBody.link.name, 'LinkedIn');
  assert.equal(createdBody.link.isEnabled, true);

  const listed = await listLinks();
  assert.equal(listed.status, 200);
  const listBody = await listed.json() as { links: { id: string }[] };
  assert.equal(listBody.links.length, 1);
  assert.equal(listBody.links[0].id, createdBody.link.id);

  const updated = await updateLink(
    jsonReq(`http://localhost/api/admin/social-links/${createdBody.link.id}`, 'PATCH', { name: 'LinkedIn', displayOrder: 3 }),
    { params: Promise.resolve({ id: createdBody.link.id }) },
  );
  assert.equal(updated.status, 200);
  const updatedBody = await updated.json() as { link: { name: string; displayOrder: number } };
  assert.equal(updatedBody.link.displayOrder, 3);

  // Disable it: the footer read must stop returning it.
  const disabled = await updateLink(
    jsonReq(`http://localhost/api/admin/social-links/${createdBody.link.id}`, 'PATCH', { isEnabled: false }),
    { params: Promise.resolve({ id: createdBody.link.id }) },
  );
  assert.equal(disabled.status, 200);
  assert.equal((await listEnabledSocialLinks()).length, 0);
  assert.equal((await listSocialLinks()).length, 1);

  const audit = await getAuditLog();
  assert.ok(audit.some((e) => e.action === 'social-link.create' && e.entityId === createdBody.link.id));
  assert.ok(audit.some((e) => e.action === 'social-link.update' && e.entityId === createdBody.link.id));

  const deleted = await deleteLink(
    new NextRequest(`http://localhost/api/admin/social-links/${createdBody.link.id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id: createdBody.link.id }) },
  );
  assert.equal(deleted.status, 200);
  assert.equal((await listSocialLinks()).length, 0);
  assert.ok((await getAuditLog()).some((e) => e.action === 'social-link.delete'));
});

test('validation: bad URLs and blank names are rejected with 400', async () => {
  __setTestSession(ADMIN);

  for (const bad of [
    { name: 'LinkedIn', url: 'javascript:alert(1)' },
    { name: 'LinkedIn', url: '/relative' },
    { name: 'LinkedIn', url: 'not a url' },
    { name: '', url: 'https://example.com/x' },
  ]) {
    const res = await createLink(jsonReq('http://localhost/api/admin/social-links', 'POST', bad));
    assert.equal(res.status, 400);
  }
  assert.equal((await listSocialLinks()).length, 0);

  // PATCH with an empty body is rejected; PATCH of a missing id is 404.
  const created = await createLink(jsonReq('http://localhost/api/admin/social-links', 'POST', LINKEDIN_BODY));
  const createdBody = await created.json() as { link: { id: string } };
  const emptyPatch = await updateLink(
    jsonReq(`http://localhost/api/admin/social-links/${createdBody.link.id}`, 'PATCH', {}),
    { params: Promise.resolve({ id: createdBody.link.id }) },
  );
  assert.equal(emptyPatch.status, 400);
  const missingPatch = await updateLink(
    jsonReq('http://localhost/api/admin/social-links/nope', 'PATCH', { name: 'X' }),
    { params: Promise.resolve({ id: 'nope' }) },
  );
  assert.equal(missingPatch.status, 404);
  const missingDelete = await deleteLink(
    new NextRequest('http://localhost/api/admin/social-links/nope', { method: 'DELETE' }),
    { params: Promise.resolve({ id: 'nope' }) },
  );
  assert.equal(missingDelete.status, 404);
});

test('RBAC: student, restricted admin and anonymous callers are denied', async () => {
  __setTestSession(STUDENT);
  assert.equal((await listLinks()).status, 403);
  assert.equal((await createLink(jsonReq('http://localhost/api/admin/social-links', 'POST', LINKEDIN_BODY))).status, 403);

  __setTestSession(RESTRICTED_ADMIN);
  assert.equal((await listLinks()).status, 403);
  assert.equal((await createLink(jsonReq('http://localhost/api/admin/social-links', 'POST', LINKEDIN_BODY))).status, 403);

  __setTestSession(null);
  assert.equal((await listLinks()).status, 401);
  assert.equal((await createLink(jsonReq('http://localhost/api/admin/social-links', 'POST', LINKEDIN_BODY))).status, 401);
  assert.equal((await listSocialLinks()).length, 0);
});

// ---------------------------------------------------------------------------
// Public footer read
// ---------------------------------------------------------------------------

test('public GET /api/social-links: empty before any admin entry, enabled-only after', async () => {
  const empty = await publicLinks();
  assert.equal(empty.status, 200);
  assert.deepEqual((await empty.json() as { links: unknown[] }).links, []);

  __setTestSession(ADMIN);
  await createLink(jsonReq('http://localhost/api/admin/social-links', 'POST', LINKEDIN_BODY));
  const gh = await createLink(jsonReq('http://localhost/api/admin/social-links', 'POST', {
    name: 'GitHub', url: 'https://github.com/Hateem-Hussain-01', displayOrder: 1,
  }));
  const ghBody = await gh.json() as { link: { id: string } };
  await createLink(jsonReq('http://localhost/api/admin/social-links', 'POST', {
    name: 'Instagram', url: 'https://www.instagram.com/codebettle', displayOrder: 2, isEnabled: false,
  }));
  __resetTestSession();

  const res = await publicLinks();
  assert.equal(res.status, 200);
  const body = await res.json() as { links: { name: string }[] };
  assert.deepEqual(body.links.map((l) => l.name), ['LinkedIn', 'GitHub']);

  // Disabling the last visible link leaves only LinkedIn; deleting both
  // returns the footer to its empty (defaults) state.
  __setTestSession(ADMIN);
  await updateLink(
    jsonReq(`http://localhost/api/admin/social-links/${ghBody.link.id}`, 'PATCH', { isEnabled: false }),
    { params: Promise.resolve({ id: ghBody.link.id }) },
  );
  __resetTestSession();
  const afterDisable = await publicLinks();
  assert.deepEqual((await afterDisable.json() as { links: { name: string }[] }).links.map((l) => l.name), ['LinkedIn']);
});

// ---------------------------------------------------------------------------
// Footer + auth navbar source checks (same pattern as phase6-design tests:
// these components import next/link and fetch, so assert on source)
// ---------------------------------------------------------------------------

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

test('Footer: real links from the shared source, 305 phone, no dead links, no X/Twitter', () => {
  const footer = read('components/layout/Footer.tsx');
  assert.match(footer, /from '@\/lib\/social'/);
  assert.match(footer, /defaultSocialLinks\(\)/);
  assert.match(footer, /resolveFooterLinks\(/);
  assert.match(footer, /fetch\('\/api\/social-links'\)/);
  assert.match(footer, /CONTACT_PHONE/);
  assert.match(footer, /CONTACT_EMAIL/);
  assert.doesNotMatch(footer, /href=['"]#['"]/);
  assert.doesNotMatch(footer, /twitter/i);
  assert.doesNotMatch(footer, /300 1234567/);
  assert.match(footer, /SocialPlatformIcon/);
  assert.match(footer, /aria-label=\{`CodeBettle on \$\{link\.label\}`\}/);
});

test('Footer contact constants: 305 phone and info@ email in the shared source', () => {
  const social = read('lib/social.ts');
  assert.match(social, /\+92 305 5261893/);
  assert.match(social, /info@codebettle\.com/);
  assert.match(social, /github\.com\/Hateem-Hussain-01/);
  assert.doesNotMatch(social, /twitter\.com|youtube\.com/i);
  assert.doesNotMatch(social, /300 1234567/);
});

test('AuthSocialNav: same shared source, same four links + community pill, unchanged', () => {
  const nav = read('components/auth/AuthSocialNav.tsx');
  assert.match(nav, /from '@\/lib\/social'/);
  assert.match(nav, /SOCIAL_PLATFORMS/);
  assert.match(nav, /WHATSAPP_COMMUNITY_URL/);
  assert.match(nav, /Join our community/);
  assert.match(nav, /whatsapp[\s\S]*facebook[\s\S]*instagram[\s\S]*linkedin/);
  assert.doesNotMatch(nav, /wa\.me\/923055261893/);
  assert.doesNotMatch(nav, /61561458044925/);
  assert.doesNotMatch(nav, /codebettle\?igsh/);
  assert.doesNotMatch(nav, /linkedin\.com\/company\/codebettle/);
});

test('Admin settings: real footer-icons manager, no fake social inputs left', () => {
  const page = read('app/admin/settings/page.tsx');
  assert.match(page, /Footer Social Icons/);
  assert.match(page, /\/api\/admin\/social-links/);
  assert.match(page, /Icon Name/);
  assert.match(page, /Icon Link/);
  assert.doesNotMatch(page, /label="Twitter"/);
  assert.doesNotMatch(page, /settings\.twitter/);
  assert.match(page, /\+92 305 5261893/);
});
