import test from 'node:test';
import assert from 'node:assert/strict';
import { __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { sanitizeBlogHtml } from '../lib/sanitize';
import { createBlogPostService, updateBlogPostService } from '../lib/services/blog-service';
import { getPostBySlug } from '../lib/db/blog';
import type { Actor } from '../lib/services/errors';

/**
 * Phase 7 — blog HTML sanitization (SEC-08 XSS fix).
 * Blog content is written in a contentEditable editor and rendered to
 * every visitor with dangerouslySetInnerHTML. Pasted content could
 * carry script tags, event handlers and iframes, and it was stored
 * verbatim. Now the HTML is sanitized on save (service) and again on
 * render (public page + admin preview).
 */

const D = (s: string) => new Date(s);
const ADMIN: Actor = { id: 'admin-1', role: 'admin', name: 'Admin' };

const EVIL =
  '<script>alert(1)</script>' +
  '<p onclick="alert(1)">Hello</p>' +
  '<img src="x" onerror="alert(1)">' +
  '<iframe src="https://evil.example"></iframe>' +
  '<a href="javascript:alert(1)">click</a>' +
  '<span style="color:red">styled</span>';

test('script, iframe and img tags are removed', () => {
  const out = sanitizeBlogHtml(EVIL);
  assert.equal(out.includes('<script'), false, out);
  assert.equal(out.includes('<iframe'), false, out);
  assert.equal(out.includes('<img'), false, out);
  assert.equal(out.includes('alert(1)'), false, out);
});

test('event handlers and javascript: links are stripped, safe markup survives', () => {
  const out = sanitizeBlogHtml(EVIL);
  assert.equal(out.includes('onclick'), false, out);
  assert.equal(out.includes('javascript:'), false, out);
  assert.equal(out.includes('<p>Hello</p>'), true, out);
  assert.equal(out.includes('>click</a>'), true, out);
  assert.equal(out.includes('<span>styled</span>'), true, out);
});

test('editor formatting is kept: headings, bold, lists, safe links', () => {
  const html =
    '<h2>Title</h2><p><strong>bold</strong> and <em>italic</em></p>' +
    '<ul><li>one</li><li>two</li></ul>' +
    '<a href="https://codebettle.com" target="_blank">site</a>' +
    '<blockquote>quoted</blockquote><pre><code>code</code></pre>';
  const out = sanitizeBlogHtml(html);
  assert.equal(out.includes('<h2>Title</h2>'), true, out);
  assert.equal(out.includes('<strong>bold</strong>'), true, out);
  assert.equal(out.includes('<li>two</li>'), true, out);
  assert.equal(out.includes('href="https://codebettle.com"'), true, out);
  // Links opening in a new tab get rel=noopener.
  assert.equal(out.includes('rel="noopener noreferrer"'), true, out);
  assert.equal(out.includes('<blockquote>quoted</blockquote>'), true, out);
});

test('plain text and empty input pass through unchanged', () => {
  assert.equal(sanitizeBlogHtml('Just text, no HTML.'), 'Just text, no HTML.');
  assert.equal(sanitizeBlogHtml(''), '');
});

test('create + update store sanitized HTML, never the raw payload', async () => {
  const fake: FakeDb = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  const created = await createBlogPostService(ADMIN, {
    slug: 'xss-test', title: 'XSS', excerpt: 'e', content: EVIL,
    thumbnail: '/t.png', category: 'General', readTime: '1 min read',
  });
  assert.ok('post' in created, JSON.stringify(created));
  const stored = await getPostBySlug('xss-test');
  assert.ok(stored);
  assert.equal(stored.content.includes('<script'), false, stored.content);
  assert.equal(stored.content.includes('onclick'), false, stored.content);
  assert.equal(stored.content.includes('<p>Hello</p>'), true, stored.content);

  const updated = await updateBlogPostService(ADMIN, stored.id, { content: EVIL + '<p>more</p>' });
  assert.ok('post' in updated, JSON.stringify(updated));
  const stored2 = await getPostBySlug('xss-test');
  assert.equal(stored2?.content.includes('alert(1)'), false, stored2?.content ?? '');
  assert.equal(stored2?.content.includes('<p>more</p>'), true, stored2?.content ?? '');
});
