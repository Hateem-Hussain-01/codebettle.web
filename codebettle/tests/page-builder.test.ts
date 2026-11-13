// Page Builder (PR #34) — slug validation, block parsing/sanitising,
// repository CRUD + publish/draft gating + missing-table fail-safe.
//
// Blocks are stored as JSON on the Page row; the public page renders
// published pages only (drafts are 404). The repository is fail-safe:
// until the SQL migration runs, reads/writes throw a clear
// PageTableMissingError (so the admin API can show a "run the SQL"
// state instead of an empty list) and the public lookup returns null
// (404, never a crash) — nothing else breaks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PageBlocks } from '../components/page-builder/PageBlocks';
import { __resetDbClient, __setDbClient, type DbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  createBlock,
  isValidSlug,
  normalizeSlug,
  parsePageBlocks,
  safeImageUrl,
  safeLink,
  sanitizePageBlocks,
  validateSlug,
  type PageBlock,
} from '../lib/page-builder';
import {
  arePageTablesReady,
  createPage,
  deletePage,
  getPageById,
  getPublishedPageBySlug,
  isPageTableMissing,
  listPages,
  PageTableMissingError,
  updatePage,
} from '../lib/db/pages';

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
});

test.afterEach(() => {
  __resetDbClient();
});

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

test('slug: valid slugs pass, bad ones are rejected with a reason', () => {
  for (const good of ['about-us', 'summer-camp-2026', 'a', 'abc123', 'x-1-y-2']) {
    assert.equal(validateSlug(good), null, good);
    assert.equal(isValidSlug(good), true, good);
  }
  assert.equal(validateSlug(''), 'URL is required');
  assert.equal(validateSlug('About Us'), 'URL may only use lowercase letters, numbers and hyphens');
  assert.equal(validateSlug('UPPER'), 'URL may only use lowercase letters, numbers and hyphens');
  assert.equal(validateSlug('has space'), 'URL may only use lowercase letters, numbers and hyphens');
  assert.equal(validateSlug('under_score'), 'URL may only use lowercase letters, numbers and hyphens');
  assert.equal(validateSlug('-leading'), 'URL may only use lowercase letters, numbers and hyphens');
  assert.equal(validateSlug('trailing-'), 'URL may only use lowercase letters, numbers and hyphens');
  assert.equal(validateSlug('double--dash'), 'URL may only use lowercase letters, numbers and hyphens');
  assert.equal(validateSlug('a'.repeat(81)), 'URL must be 80 characters or fewer');
  assert.equal(validateSlug('admin'), 'This URL is reserved');
  assert.equal(validateSlug('api'), 'This URL is reserved');
  assert.equal(validateSlug('login'), 'This URL is reserved');
});

test('slug: normalizeSlug turns a title into a URL-safe slug', () => {
  assert.equal(normalizeSlug('Summer Camp 2026'), 'summer-camp-2026');
  assert.equal(normalizeSlug('  Hello_World!  '), 'hello-world');
  assert.equal(normalizeSlug('A  B   C'), 'a-b-c');
  assert.equal(normalizeSlug('---x---'), 'x');
  assert.equal(normalizeSlug(''), '');
});

// ---------------------------------------------------------------------------
// Blocks — parse / sanitise
// ---------------------------------------------------------------------------

function sampleBlocks(): PageBlock[] {
  return [
    createBlock('hero', 'b1'),
    { ...createBlock('text', 'b2'), content: { html: '<p>Hello <strong>world</strong></p>' } },
    { ...createBlock('stats', 'b3'), content: { items: [{ value: '1500+', label: 'Students' }] } },
  ];
}

test('blocks: valid blocks pass through unchanged', () => {
  const parsed = parsePageBlocks(sampleBlocks());
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0]?.type, 'hero');
  assert.equal(parsed[0]?.layout.width, 100);
  assert.equal(parsed[0]?.layout.height, undefined);
  assert.deepEqual((parsed[2]?.content as { items: unknown[] }).items, [{ value: '1500+', label: 'Students' }]);
});

test('blocks: unknown types are dropped, non-arrays yield an empty list', () => {
  const parsed = parsePageBlocks([
    { id: 'x', type: 'mystery', layout: { width: 100 }, content: {} },
    { id: 'y', type: 'text', layout: { width: 100 }, content: { html: '<p>ok</p>' } },
  ]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.type, 'text');
  assert.deepEqual(parsePageBlocks(null), []);
  assert.deepEqual(parsePageBlocks('nope'), []);
  assert.deepEqual(parsePageBlocks({}), []);
});

test('blocks: layouts are clamped (width 25–100, height 120–800 or auto)', () => {
  const parsed = parsePageBlocks([
    { id: 'a', type: 'hero', layout: { width: 10, height: 50 }, content: {} },
    { id: 'b', type: 'hero', layout: { width: 500, height: 5000 }, content: {} },
    { id: 'c', type: 'hero', layout: {}, content: {} },
    { id: 'd', type: 'hero', layout: { width: 'wide', height: 'tall' }, content: {} },
  ]);
  assert.equal(parsed[0]?.layout.width, 25);
  assert.equal(parsed[0]?.layout.height, 120);
  assert.equal(parsed[1]?.layout.width, 100);
  assert.equal(parsed[1]?.layout.height, 800);
  assert.equal(parsed[2]?.layout.width, 100);
  assert.equal(parsed[2]?.layout.height, undefined);
  assert.equal(parsed[3]?.layout.width, 100);
  assert.equal(parsed[3]?.layout.height, undefined);
});

test('blocks: text HTML is sanitised (scripts stripped), stats capped at 8, blocks capped at 50', () => {
  const parsed = parsePageBlocks([
    {
      id: 't',
      type: 'text',
      layout: { width: 100 },
      content: { html: '<p>ok</p><script>alert(1)</script><a href="javascript:evil()">x</a>' },
    },
    {
      id: 's',
      type: 'stats',
      layout: { width: 100 },
      content: { items: Array.from({ length: 12 }, (_, i) => ({ value: `${i}`, label: `L${i}` })) },
    },
  ]);
  const html = (parsed[0]?.content as { html: string }).html;
  assert.ok(!html.includes('<script>'), html);
  assert.ok(!html.includes('javascript:'), html);
  assert.ok(html.includes('<p>ok</p>'), html);
  assert.equal((parsed[1]?.content as { items: unknown[] }).items.length, 8);

  const many = Array.from({ length: 60 }, (_, i) => createBlock('text', `b${i}`));
  assert.equal(sanitizePageBlocks(many).length, 50);
});

test('blocks: safeImageUrl / safeLink only allow http(s) (and site-relative links)', () => {
  assert.equal(safeImageUrl('https://example.com/a.jpg'), 'https://example.com/a.jpg');
  assert.equal(safeImageUrl('http://example.com/a.jpg'), 'http://example.com/a.jpg');
  assert.equal(safeImageUrl('javascript:alert(1)'), '');
  assert.equal(safeImageUrl('data:image/png;base64,xxx'), '');
  assert.equal(safeImageUrl('/relative.jpg'), '');
  assert.equal(safeLink('/courses'), '/courses');
  assert.equal(safeLink('https://codebettle.com'), 'https://codebettle.com');
  assert.equal(safeLink('javascript:alert(1)'), '');
  assert.equal(safeLink('//evil.com'), '');
  assert.equal(safeLink('just text'), '');
});

// ---------------------------------------------------------------------------
// Rendering — the shared block renderer (public page + admin preview)
// ---------------------------------------------------------------------------

test('rendering: PageBlocks renders every block type; empty blocks leave no gap', () => {
  const blocks: PageBlock[] = [
    { ...createBlock('hero', 'h1'), content: { heading: 'Summer Camp 2026', subtext: 'Learn with us', imageUrl: '', ctaLabel: 'Explore courses', ctaLink: '/courses' } },
    { ...createBlock('text', 't1'), content: { html: '<h2>What you will learn</h2><p>Over <strong>eight weeks</strong> you build.</p>' } },
    { ...createBlock('stats', 's1'), content: { items: [{ value: '1500+', label: 'Active Students' }, { value: '4.8', label: 'Average Rating' }] } },
    // Empty image block (no URL) — must render nothing, not an empty section.
    { ...createBlock('image', 'i1'), content: { imageUrl: '', alt: '' } },
    // Empty text block — must render nothing either.
    { ...createBlock('text', 't2'), content: { html: '<p><br></p>' } },
    { ...createBlock('cta', 'c1'), content: { heading: 'Ready to start?', text: 'Join us.', buttonLabel: 'Enroll now', buttonLink: '/courses' } },
  ];
  const html = renderToStaticMarkup(createElement(PageBlocks, { blocks }));
  assert.ok(html.includes('Summer Camp 2026'), html);
  assert.ok(html.includes('Explore courses'), html);
  assert.ok(html.includes('What you will learn'), html);
  assert.ok(html.includes('eight weeks'), html);
  assert.ok(html.includes('1500+'), html);
  assert.ok(html.includes('4.8'), html);
  assert.ok(html.includes('Ready to start?'), html);
  assert.ok(html.includes('Enroll now'), html);
  // 4 visible blocks (hero, text, stats, cta) — the 2 empty ones add no section.
  assert.equal((html.match(/<section/g) ?? []).length, 4);
  // Links are site-relative; no javascript: anywhere.
  assert.ok(!html.includes('javascript:'), html);
  // Width/height layout lands on the section wrapper.
  const wide = renderToStaticMarkup(
    createElement(PageBlocks, {
      blocks: [{ ...createBlock('hero', 'w1'), layout: { width: 50, height: 300 }, content: { heading: 'Half', subtext: '', imageUrl: '', ctaLabel: '', ctaLink: '' } }],
    }),
  );
  assert.ok(wide.includes('width:50%'), wide);
  assert.ok(wide.includes('min-height:300px'), wide);
});

test('rendering: an empty page renders nothing', () => {
  assert.equal(renderToStaticMarkup(createElement(PageBlocks, { blocks: [] })), '');
});

// ---------------------------------------------------------------------------
// Repository — CRUD + publish/draft gating
// ---------------------------------------------------------------------------

test('repo: create → list → get → publish → public lookup → update → delete', async () => {
  const created = await createPage({ title: 'Summer Camp', slug: 'summer-camp' });
  assert.equal(created.title, 'Summer Camp');
  assert.equal(created.slug, 'summer-camp');
  assert.equal(created.status, 'draft');
  assert.deepEqual(created.blocks, []);

  // A draft is never publicly visible.
  assert.equal(await getPublishedPageBySlug('summer-camp'), null);
  assert.equal(await getPublishedPageBySlug('nope'), null);

  const withBlocks = await updatePage(created.id, {
    blocks: [
      { ...createBlock('hero', 'h1'), content: { heading: 'Welcome', subtext: '', imageUrl: '', ctaLabel: '', ctaLink: '' } },
      { ...createBlock('text', 't1'), content: { html: '<p>Hi</p>' } },
    ],
  });
  assert.equal(withBlocks?.blocks.length, 2);
  assert.equal(withBlocks?.blocks[0]?.type, 'hero');

  const published = await updatePage(created.id, { status: 'published' });
  assert.equal(published?.status, 'published');
  const pub = await getPublishedPageBySlug('summer-camp');
  assert.equal(pub?.id, created.id);
  assert.equal(pub?.blocks.length, 2);

  const listed = await listPages();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.slug, 'summer-camp');

  const renamed = await updatePage(created.id, { title: 'Summer Camp 2026', slug: 'summer-camp-2026' });
  assert.equal(renamed?.title, 'Summer Camp 2026');
  assert.equal(renamed?.slug, 'summer-camp-2026');
  assert.equal((await getPageById(created.id))?.slug, 'summer-camp-2026');
  assert.equal(await getPublishedPageBySlug('summer-camp'), null);

  assert.equal(await deletePage(created.id), true);
  assert.equal(await getPageById(created.id), null);
  assert.deepEqual(await listPages(), []);
  assert.equal(await deletePage(created.id), false);
  assert.equal(await updatePage(created.id, { title: 'x' }), null);
});

test('repo: unpublishing hides the page publicly again', async () => {
  const created = await createPage({ title: 'T', slug: 't', status: 'published' });
  assert.ok(await getPublishedPageBySlug('t'));
  await updatePage(created.id, { status: 'draft' });
  assert.equal(await getPublishedPageBySlug('t'), null);
});

test('repo: arePageTablesReady is true when the table exists', async () => {
  assert.equal(await arePageTablesReady(), true);
});

// ---------------------------------------------------------------------------
// Fail-safe — missing table (pre-migration state)
// ---------------------------------------------------------------------------

/** A client that throws Postgres 42P01 (table missing) on every Page read — the pre-migration state. */
const missingTableError = () =>
  Object.assign(new Error('relation "public"."Page" does not exist'), { code: '42P01' });

function missingTableClient(): DbClient {
  const throwing = {
    where: () => { throw missingTableError(); },
    orderBy: () => { throw missingTableError(); },
    first: async () => { throw missingTableError(); },
    all: async () => { throw missingTableError(); },
    create: async () => { throw missingTableError(); },
    update: async () => { throw missingTableError(); },
    delete: async () => { throw missingTableError(); },
  };
  return {
    orm: {
      public: new Proxy({}, { get: (_t, model: string) => (model === 'Page' ? throwing : fake.orm.public[model]) }),
    },
    transaction: fake.transaction.bind(fake),
  } as unknown as DbClient;
}

test('fail-safe: isPageTableMissing recognises the missing-table error only', () => {
  assert.equal(isPageTableMissing(missingTableError()), true);
  assert.equal(isPageTableMissing(new PageTableMissingError()), true);
  assert.equal(isPageTableMissing(Object.assign(new Error('boom'), { code: 'XX000' })), false);
  assert.equal(isPageTableMissing(new Error('relation "public"."Course" does not exist')), false);
  assert.equal(isPageTableMissing(null), false);
});

test('fail-safe: missing Page table surfaces a clear error (reads) or null (public lookup) instead of crashing', async () => {
  __setDbClient(missingTableClient());
  // Reads throw the typed error so the admin API can tell "table not
  // set up yet" apart from "no pages yet" (tableMissing flag).
  await assert.rejects(() => listPages(), PageTableMissingError);
  await assert.rejects(() => getPageById('x'), PageTableMissingError);
  // The public lookup is the exception: a missing table is a 404,
  // never a crash.
  assert.equal(await getPublishedPageBySlug('x'), null);
  assert.equal(await arePageTablesReady(), false);
  await assert.rejects(() => createPage({ title: 'T', slug: 't' }), PageTableMissingError);
  await assert.rejects(() => updatePage('x', { title: 'T' }), PageTableMissingError);
  await assert.rejects(() => deletePage('x'), PageTableMissingError);
  // A missing table is not a missing column — a real DB error still throws.
  const other = Object.assign(new Error('boom'), { code: 'XX000' });
  __setDbClient({
    orm: {
      public: new Proxy({}, {
        get: (_t, model: string) => (model === 'Page'
          ? new Proxy({}, { get: () => { throw other; } })
          : fake.orm.public[model]),
      }),
    },
    transaction: fake.transaction.bind(fake),
  } as unknown as DbClient);
  await assert.rejects(() => listPages(), /boom/);
});
