import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  getPublicNavConfig,
  resolveNavbarInitialItems,
  type PublicNavConfig,
} from '../lib/nav-config';
import { DEFAULT_NAV_ITEMS } from '../lib/management';
import { DEFAULT_SETTINGS } from '../lib/services/settings-service';

/**
 * Navbar flash fix (Eman, 15 Nov 2026): he deleted the 'Instructors'
 * tab in the Navbar Editor, but on the landing page the tab showed
 * for a few seconds on every tab click before disappearing.
 *
 * Root cause: no page passed navItems to the Navbar, so its first
 * paint was always the hardcoded fallback (which includes
 * Instructors); the saved items only arrived after GET /api/nav
 * resolved, and every SPA navigation remounted the Navbar and
 * repeated the flash. The fix: the root layout fetches the config
 * server-side (getPublicNavConfig) and provides it to the Navbar, so
 * the first paint already carries the saved items; the client fetch
 * is only a background revalidation. The hardcoded defaults may be
 * used ONLY when the DB truly has no saved config (fromDefaults) —
 * never as a visible placeholder while a saved config is loading.
 */

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
});

test.afterEach(() => {
  __resetDbClient();
});

/** The live NavItem rows at the time of the report: Instructors deleted. */
const LIVE_NAV_ROWS = [
  { id: 'nav-1', label: 'Courses', href: '/courses', order: 0, enabled: true, createdAt: new Date('2026-11-14T00:00:00Z'), updatedAt: new Date('2026-11-14T00:00:00Z') },
  { id: 'nav-2', label: 'Blog', href: '/blog', order: 2, enabled: true, createdAt: new Date('2026-11-14T00:00:00Z'), updatedAt: new Date('2026-11-14T00:00:00Z') },
  { id: 'nav-3', label: 'Spotlight', href: '/success-stories', order: 3, enabled: true, createdAt: new Date('2026-11-14T00:00:00Z'), updatedAt: new Date('2026-11-14T00:00:00Z') },
  { id: 'nav-4', label: 'About', href: '/about', order: 4, enabled: true, createdAt: new Date('2026-11-14T00:00:00Z'), updatedAt: new Date('2026-11-14T00:00:00Z') },
  { id: 'nav-5', label: 'Contact', href: '/contact', order: 5, enabled: true, createdAt: new Date('2026-11-14T00:00:00Z'), updatedAt: new Date('2026-11-14T00:00:00Z') },
];

const LIVE_NAV_ITEMS = LIVE_NAV_ROWS.map(({ label, href }) => ({ label, href }));

test('saved config without Instructors: getPublicNavConfig returns exactly the saved items, fromDefaults false', async () => {
  fake.seed('NavItem', LIVE_NAV_ROWS);
  const config = await getPublicNavConfig();
  assert.deepEqual(config.items, LIVE_NAV_ITEMS);
  assert.equal(config.fromDefaults, false);
  assert.equal(config.logoUrl, DEFAULT_SETTINGS.navbarLogoUrl);
  assert.ok(!config.items.some((item) => item.href === '/instructors'));
});

test('empty NavItem table: getPublicNavConfig falls back to the hardcoded defaults, fromDefaults true', async () => {
  const config = await getPublicNavConfig();
  assert.deepEqual(config.items, DEFAULT_NAV_ITEMS);
  assert.equal(config.fromDefaults, true);
});

test('a saved but disabled Instructors row is not rendered', async () => {
  fake.seed('NavItem', [
    ...LIVE_NAV_ROWS,
    { id: 'nav-6', label: 'Instructors', href: '/instructors', order: 1, enabled: false, createdAt: new Date('2026-11-14T00:00:00Z'), updatedAt: new Date('2026-11-14T00:00:00Z') },
  ]);
  const config = await getPublicNavConfig();
  assert.deepEqual(config.items, LIVE_NAV_ITEMS);
  assert.equal(config.fromDefaults, false);
  assert.ok(!config.items.some((item) => item.href === '/instructors'));
});

test('first-paint rule: a server config without Instructors never yields an Instructors link', async () => {
  fake.seed('NavItem', LIVE_NAV_ROWS);
  const serverConfig = await getPublicNavConfig();
  const firstPaint = resolveNavbarInitialItems(undefined, serverConfig);
  assert.deepEqual(firstPaint, LIVE_NAV_ITEMS);
  assert.ok(!firstPaint.some((item) => item.href === '/instructors'));
});

test('first-paint rule: with no prop and no server config the navbar starts EMPTY, never the fallback', () => {
  // This is the pin for the bug: the old code initialised state to the
  // hardcoded fallback (Instructors included) while /api/nav loaded.
  assert.deepEqual(resolveNavbarInitialItems(undefined, null), []);
});

test('first-paint rule: an explicit navItems prop wins over the server config', async () => {
  fake.seed('NavItem', LIVE_NAV_ROWS);
  const serverConfig: PublicNavConfig = await getPublicNavConfig();
  const prop = [{ label: 'Custom', href: '/custom' }];
  assert.deepEqual(resolveNavbarInitialItems(prop, serverConfig), prop);
});

test('GET /api/nav returns the saved items (no Instructors) + fromDefaults false + no-store', async () => {
  fake.seed('NavItem', LIVE_NAV_ROWS);
  const { GET } = await import('../app/api/nav/route');
  const res = await GET();
  const body = (await res.json()) as PublicNavConfig;
  assert.deepEqual(body.items, LIVE_NAV_ITEMS);
  assert.equal(body.fromDefaults, false);
  assert.ok(!body.items.some((item) => item.href === '/instructors'));
  assert.match(res.headers.get('cache-control') ?? '', /no-store/);
});

test('GET /api/nav with an empty table returns the defaults + fromDefaults true', async () => {
  const { GET } = await import('../app/api/nav/route');
  const res = await GET();
  const body = (await res.json()) as PublicNavConfig;
  assert.deepEqual(body.items, DEFAULT_NAV_ITEMS);
  assert.equal(body.fromDefaults, true);
});
