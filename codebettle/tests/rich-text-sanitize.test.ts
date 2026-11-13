import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeBlogHtml, sanitizeEmailHtml } from '../lib/sanitize';

/**
 * Sanitizer idempotency — the invariant the rich-text editors rely on.
 *
 * Both editors (components/ui/RichTextEditor.tsx and the local editor
 * in app/admin/blog/blog-client.tsx) are uncontrolled: a sync effect
 * compares sanitize(initialHtml) against the sanitized HTML the
 * editor itself last emitted, and only rewrites the DOM when they
 * differ. That comparison is only meaningful if sanitizing already
 * sanitized HTML is a no-op. If a sanitizer ever changed its own
 * output on a second pass (e.g. a transform that keeps adding
 * attributes), the effect would rewrite the DOM on every keystroke,
 * the caret would jump to the start, text would type backwards and
 * backspace would stop working — the bug fixed by making the editors
 * uncontrolled. These tests pin the invariant with representative
 * editor-produced HTML, including the cases the transforms touch
 * (target=_blank links gaining rel, embedded images gaining style).
 */

const BLOG_HTML =
  '<p>Hello <strong>world</strong>, this is <em>me</em>.</p>' +
  '<h2>Heading</h2>' +
  '<ul><li>one</li><li>two</li></ul>' +
  '<ol><li>first</li></ol>' +
  '<blockquote>quoted</blockquote>' +
  '<p><a href="https://codebettle.com" target="_blank">CodeBettle</a></p>' +
  '<p><code>const x = 1;</code></p>';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const EMAIL_HTML =
  '<p>Welcome, {{STUDENT_NAME}}!</p>' +
  '<p>Your <strong>certificate</strong> is ready.</p>' +
  '<h3>Next steps</h3>' +
  '<ul><li>Open your dashboard</li></ul>' +
  '<p><a href="https://codebettle-web.vercel.app/verify/abc" target="_blank">Verify it here</a></p>' +
  `<p><img src="${TINY_PNG}" alt="badge"></p>`;

test('sanitizeBlogHtml is idempotent on editor-produced HTML', () => {
  const once = sanitizeBlogHtml(BLOG_HTML);
  const twice = sanitizeBlogHtml(once);
  assert.equal(twice, once, `second pass changed the HTML:\n${once}\n→\n${twice}`);
  // The transforms actually ran (rel added to the _blank link).
  assert.ok(once.includes('rel="noopener noreferrer"'), once);
});

test('sanitizeEmailHtml is idempotent on editor-produced HTML', () => {
  const once = sanitizeEmailHtml(EMAIL_HTML);
  const twice = sanitizeEmailHtml(once);
  assert.equal(twice, once, `second pass changed the HTML:\n${once}\n→\n${twice}`);
  // The transforms actually ran (rel on the _blank link, style on the img
  // — sanitize-html normalizes the style value, so no spaces).
  assert.ok(once.includes('rel="noopener noreferrer"'), once);
  assert.ok(once.includes('max-width:100%'), once);
  // Placeholders and the embedded image survive both passes.
  assert.ok(once.includes('{{STUDENT_NAME}}'), once);
  assert.ok(once.includes(TINY_PNG), once);
});

test('sanitizeBlogHtml / sanitizeEmailHtml are idempotent on empty input', () => {
  assert.equal(sanitizeBlogHtml(sanitizeBlogHtml('')), '');
  assert.equal(sanitizeEmailHtml(sanitizeEmailHtml('')), '');
});
