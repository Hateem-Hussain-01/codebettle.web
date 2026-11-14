import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import sitemap from '../app/sitemap';
import robots from '../app/robots';
import { ADMIN_AREAS } from '../lib/admin-access';
import { resolveNavItems } from '../lib/management';
import { DEFAULT_SETTINGS } from '../lib/services/settings-service';
import {
  DEFAULT_LINKS,
  LINK_ICON_OPTIONS,
  LINKS_PAGE_URL,
  isLinkIconKey,
  resolveLinks,
  validateLink,
} from '../lib/links';
import {
  createLink,
  deleteLink,
  getLinkById,
  listEnabledLinks,
  listLinks,
  seedDefaultLinks,
  updateLink,
} from '../lib/db/links';

/**
 * Links page (Linktree-style public /links page + Admin > Links Page).
 * The page is reached ONLY by the direct link sent to clients: it must
 * NOT be in the navbar, footer, sitemap or robots, and no page on the
 * site links to it.
 */

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
});

test.afterEach(() => {
  __resetDbClient();
});

test('LINKS_PAGE_URL is the production URL, never localhost', () => {
  assert.equal(LINKS_PAGE_URL, 'https://codebettle-web.vercel.app/links');
});

test('DEFAULT_LINKS seeds the 6 verified links, in order, with valid icons', () => {
  assert.equal(DEFAULT_LINKS.length, 6);
  assert.deepEqual(
    DEFAULT_LINKS.map((l) => l.label),
    [
      'Explore Our Courses',
      'Book a Call',
      'Our Success Stories',
      'Become a Campus Ambassador',
      'Chat on WhatsApp',
      'Join Our WhatsApp Community',
    ],
  );
  assert.deepEqual(
    DEFAULT_LINKS.map((l) => l.url),
    [
      'https://codebettle-web.vercel.app/courses',
      'https://codebettle-web.vercel.app/book-a-call',
      'https://codebettle-web.vercel.app/success-stories',
      'https://codebettle-web.vercel.app/become-ambassador',
      'https://wa.me/923055261893',
      'https://chat.whatsapp.com/GDclFx0AVxn2uxxAdwDVj2',
    ],
  );
  for (const link of DEFAULT_LINKS) {
    assert.ok(link.url.startsWith('https://'), `${link.label} must be an https URL`);
    assert.ok(isLinkIconKey(link.icon), `${link.label} has an unknown icon key`);
    assert.equal(validateLink(link), null);
  }
  assert.deepEqual(
    DEFAULT_LINKS.map((l) => l.order),
    [0, 1, 2, 3, 4, 5],
  );
  assert.ok(LINK_ICON_OPTIONS.some((o) => o.key === 'link'));
});

test('validateLink accepts site paths and https URLs, rejects the rest', () => {
  assert.equal(validateLink({ label: 'Courses', url: '/courses' }), null);
  assert.equal(validateLink({ label: 'Site', url: 'https://example.com/x', icon: 'globe' }), null);
  assert.equal(validateLink({ label: '', url: '/courses' }), 'Label is required');
  assert.equal(validateLink({ label: 'x'.repeat(61), url: '/courses' }), 'Label must be 60 characters or fewer');
  assert.equal(validateLink({ label: 'Courses', url: '' }), 'Link URL is required');
  assert.equal(validateLink({ label: 'Courses', url: '/my page' }), 'Link path must not contain spaces');
  assert.equal(
    validateLink({ label: 'Courses', url: 'ftp://example.com' }),
    'Link must be a site path (starting with /) or a full http(s) URL',
  );
  assert.equal(validateLink({ label: 'Courses', url: '/courses', icon: 'nope' }), 'Unknown icon — pick one from the list');
});

test('resolveLinks keeps enabled links only, in order', () => {
  const rows = [
    { enabled: true, order: 2, createdAt: '2026-01-01T00:00:00.000Z' },
    { enabled: false, order: 0, createdAt: '2026-01-01T00:00:00.000Z' },
    { enabled: true, order: 1, createdAt: '2026-01-01T00:00:00.000Z' },
  ];
  assert.deepEqual(resolveLinks(rows).map((r) => r.order), [1, 2]);
  assert.deepEqual(resolveLinks([]), []);
  assert.deepEqual(resolveLinks(undefined), []);
});

test('links repository: create, list, get, update, delete, seed (idempotent)', async () => {
  assert.deepEqual(await listLinks(), []);
  assert.deepEqual(await listEnabledLinks(), []);

  const created = await createLink({ label: 'Courses', url: '/courses', icon: 'courses', order: 0 });
  assert.equal(created.label, 'Courses');
  assert.equal(created.icon, 'courses');
  assert.equal(created.enabled, true);
  assert.equal((await listLinks()).length, 1);

  const fetched = await getLinkById(created.id);
  assert.equal(fetched?.url, '/courses');

  const updated = await updateLink(created.id, { label: 'All Courses', enabled: false });
  assert.equal(updated?.label, 'All Courses');
  assert.equal(updated?.enabled, false);
  assert.deepEqual(await listEnabledLinks(), []);

  await updateLink(created.id, { enabled: true });
  assert.equal((await listEnabledLinks()).length, 1);

  assert.equal(await deleteLink(created.id), true);
  assert.deepEqual(await listLinks(), []);
  assert.equal(await getLinkById(created.id), null);

  // Seed: 6 defaults the first time, no-op the second time.
  const seeded = await seedDefaultLinks();
  assert.equal(seeded.length, 6);
  assert.deepEqual(
    (await listLinks()).map((l) => l.label),
    DEFAULT_LINKS.map((l) => l.label),
  );
  const seededAgain = await seedDefaultLinks();
  assert.equal(seededAgain.length, 6);
  assert.equal((await listLinks()).length, 6);
});

test('links page settings defaults are the verified company contact', () => {
  assert.equal(DEFAULT_SETTINGS.linksTagline, 'Learn. Code. Success.');
  assert.equal(DEFAULT_SETTINGS.linksPhone, '+92 305 5261893');
  assert.equal(DEFAULT_SETTINGS.linksEmail, 'info@codebettle.com');
  assert.equal(DEFAULT_SETTINGS.linksLocation, 'Lahore, Punjab, Pakistan');
});

test('admin: Links Page is a sidebar area; Page Builder stays last', () => {
  const area = ADMIN_AREAS.find((a) => a.key === 'links-page');
  assert.ok(area);
  assert.equal(area.href, '/admin/links-page');
  assert.equal(ADMIN_AREAS[ADMIN_AREAS.length - 1]?.key, 'page-builder');
});

test('hidden from the site: /links is in no navbar, sitemap or robots rule', async () => {
  // Navbar fallback items (and any stored config resolved through them).
  assert.ok(!resolveNavItems([]).some((item) => item.href === '/links'));
  // Sitemap: public pages + courses/posts only — no /links entry.
  const urls = await sitemap();
  assert.ok(!urls.some((u) => u.url === `${LINKS_PAGE_URL}`));
  assert.ok(!urls.some((u) => u.url.endsWith('/links')));
  // Robots: /links is a public page, so it must NOT be disallowed.
  const rules = robots();
  const disallow = Array.isArray(rules.rules) ? [] : (rules.rules.disallow ?? []);
  const flat = Array.isArray(disallow) ? disallow : [disallow];
  assert.ok(!flat.some((d) => typeof d === 'string' && d.includes('/links')));
});
