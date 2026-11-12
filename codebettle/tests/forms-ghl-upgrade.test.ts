import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildEmbedSnippet,
  buildFormShareUrl,
  formButtonBorderRadius,
  formButtonTextColor,
  formFontFamily,
  formMaxWidthPx,
  isValidCoverImageUrl,
  resolveFormStyle,
  validateCoverImageUrlValue,
  validateFormStyleValue,
} from '../lib/form-style';
import {
  canPreviewForm,
  decideFormRender,
  isEmbedRequest,
  isPreviewRequest,
} from '../lib/form-access';
import { buildCspHeader, shouldAllowFraming } from '../lib/security';
import { validateSchema, type FormSchema } from '../lib/forms';
import { validateFormSchema } from '../lib/services/form-schema';
import {
  deleteFormCoverImage,
  formCoverImagePathFromUrl,
  uploadFormCoverImage,
} from '../lib/services/course-image-storage';

const GOOD_FIELD = { id: 'name', type: 'text', label: 'Name', required: true } as const;

function schemaWith(overrides: Record<string, unknown>): unknown {
  return { fields: [GOOD_FIELD], ...overrides };
}

// ---------------------------------------------------------------------------
// Item 4 — style validation
// ---------------------------------------------------------------------------

test('style validation: a full valid style passes everywhere it is checked', () => {
  const style = {
    backgroundColor: '#e9e8f8',
    textColor: '#111111',
    primaryColor: '#f5c518',
    buttonShape: 'pill',
    font: 'serif',
    formWidth: 'wide',
  };
  assert.deepEqual(validateFormStyleValue(style), []);
  // The client-side builder validator and the server validator agree.
  assert.deepEqual(
    validateSchema({ fields: [GOOD_FIELD], style } as unknown as FormSchema),
    [],
  );
  const server = validateFormSchema(schemaWith({ style }));
  assert.equal(server.ok, true);
});

test('style validation: absent style is valid (existing forms keep the defaults)', () => {
  assert.deepEqual(validateFormStyleValue(undefined), []);
  assert.deepEqual(validateSchema({ fields: [GOOD_FIELD] }), []);
  assert.equal(validateFormSchema(schemaWith({})).ok, true);
});

test('style validation: CSS injection and non-hex colours are rejected', () => {
  const badColours = [
    'red', // named colour
    '#fff', // 3-digit hex
    '#f5c51800', // 8-digit hex
    'rgb(245, 197, 24)',
    'url(https://evil.example/x.png)',
    'url(javascript:alert(1))',
    'expression(alert(1))',
    'linear-gradient(red, blue)',
    '#f5c518; background-image: url(https://evil.example/x)',
  ];
  for (const colour of badColours) {
    const errors = validateFormStyleValue({ backgroundColor: colour });
    assert.equal(errors.length, 1, `expected ${JSON.stringify(colour)} to be rejected`);
    assert.match(errors[0], /6-digit hex/);
  }
  // The same payloads are rejected by the server validator too.
  const server = validateFormSchema(
    schemaWith({ style: { backgroundColor: 'url(https://evil.example/x.png)' } }),
  );
  assert.equal(server.ok, false);
  if (!server.ok) assert.match(server.errors[0], /6-digit hex/);
});

test('style validation: enum violations and unknown keys are rejected', () => {
  assert.match(validateFormStyleValue({ buttonShape: 'oval' })[0], /buttonShape/);
  assert.match(validateFormStyleValue({ font: 'comic-sans' })[0], /font/);
  assert.match(validateFormStyleValue({ formWidth: 'huge' })[0], /formWidth/);
  assert.match(validateFormStyleValue({ borderRadius: '4px' })[0], /must be an object/);
  assert.match(
    validateFormStyleValue({ backgroundColor: 123 })[0],
    /6-digit hex/,
  );
  assert.deepEqual(validateFormStyleValue('dark'), ['Schema style must be an object']);
  assert.deepEqual(validateFormStyleValue([]), ['Schema style must be an object']);
});

// ---------------------------------------------------------------------------
// Item 4 — style resolution (what the renderers apply)
// ---------------------------------------------------------------------------

test('style resolution: unset style resolves to the current dark + gold defaults', () => {
  const resolved = resolveFormStyle(undefined);
  assert.equal(resolved.backgroundColor, undefined);
  assert.equal(resolved.textColor, undefined);
  assert.equal(resolved.primaryColor, undefined);
  assert.equal(resolved.buttonShape, 'rounded');
  assert.equal(resolved.font, 'inter');
  assert.equal(resolved.formWidth, 'medium');
  // A partial style keeps the defaults for the rest.
  const partial = resolveFormStyle({ primaryColor: '#8db9f0' });
  assert.equal(partial.primaryColor, '#8db9f0');
  assert.equal(partial.buttonShape, 'rounded');
  assert.equal(partial.font, 'inter');
});

test('style resolution: font stacks, widths and button radii', () => {
  assert.match(formFontFamily('inter'), /Inter/);
  assert.match(formFontFamily('system'), /system-ui/);
  assert.match(formFontFamily('serif'), /Georgia/);
  assert.match(formFontFamily('mono'), /monospace/);
  assert.equal(formMaxWidthPx('narrow'), 480);
  assert.equal(formMaxWidthPx('medium'), 672);
  assert.equal(formMaxWidthPx('wide'), 896);
  assert.equal(formButtonBorderRadius('rounded'), '8px');
  assert.equal(formButtonBorderRadius('pill'), '9999px');
  assert.equal(formButtonBorderRadius('square'), '0px');
});

test('style resolution: button text stays readable on any button colour', () => {
  assert.equal(formButtonTextColor('#f5c518'), '#1a1a1a'); // gold -> dark text
  assert.equal(formButtonTextColor('#ffffff'), '#1a1a1a');
  assert.equal(formButtonTextColor('#111111'), '#ffffff');
  assert.equal(formButtonTextColor('#1e3a8a'), '#ffffff');
  assert.equal(formButtonTextColor('#8db9f0'), '#1a1a1a');
});

// ---------------------------------------------------------------------------
// Item 5 — cover image URL validation
// ---------------------------------------------------------------------------

test('cover URL validation: http(s) and same-origin paths pass; the rest fail', () => {
  assert.deepEqual(validateCoverImageUrlValue(undefined), []);
  assert.deepEqual(
    validateCoverImageUrlValue('https://example.supabase.co/storage/v1/object/public/course-images/forms/f1/a.jpg'),
    [],
  );
  assert.deepEqual(validateCoverImageUrlValue('http://localhost:3000/covers/x.png'), []);
  assert.deepEqual(validateCoverImageUrlValue('/covers/x.png'), []);
  for (const bad of [
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    '//evil.example/x.png', // protocol-relative
    'ftp://example.com/x.png',
    'covers/x.png', // relative, no leading slash
    '',
    '   ',
  ]) {
    assert.equal(isValidCoverImageUrl(bad), false, `expected ${JSON.stringify(bad)} to be invalid`);
    assert.equal(validateCoverImageUrlValue(bad).length, 1);
  }
  // The server validator rejects a bad cover URL inside a schema.
  const server = validateFormSchema(schemaWith({ coverImageUrl: 'javascript:alert(1)' }));
  assert.equal(server.ok, false);
  if (!server.ok) assert.match(server.errors[0], /coverImageUrl/);
  assert.equal(
    validateFormSchema(schemaWith({ coverImageUrl: '/covers/x.png' })).ok,
    true,
  );
});

// ---------------------------------------------------------------------------
// Item 5 — cover upload service (existing public `course-images` bucket)
// ---------------------------------------------------------------------------

const PNG = new TextEncoder().encode('fake png bytes').buffer as ArrayBuffer;

function mockStorageClient(): { client: SupabaseClient; calls: { bucket: string; path?: string }[] } {
  const calls: { bucket: string; path?: string }[] = [];
  const client = {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string) => {
          calls.push({ bucket, path });
          return { data: { path, fullPath: `${bucket}/${path}` }, error: null };
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}` },
        }),
        remove: async (paths: string[]) => {
          calls.push({ bucket, path: paths[0] });
          return { data: [], error: null };
        },
      }),
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

test('cover upload: stores under forms/<formId>/ in the course-images bucket', async () => {
  const { client, calls } = mockStorageClient();
  const { url, path } = await uploadFormCoverImage(
    'form-1',
    { name: 'cover.png', type: 'image/png', size: 1024, arrayBuffer: PNG },
    client,
  );
  assert.match(path, /^forms\/form-1\/[0-9a-f-]+\.png$/);
  assert.equal(calls[0].bucket, 'course-images');
  assert.match(url, /\/course-images\/forms\/form-1\//);
  assert.equal(formCoverImagePathFromUrl(url), path);
  // A course thumbnail URL is never mistaken for a form cover.
  assert.equal(
    formCoverImagePathFromUrl(
      'https://example.supabase.co/storage/v1/object/public/course-images/courses/c1/thumb.jpg',
    ),
    null,
  );
  assert.equal(formCoverImagePathFromUrl('https://evil.example/x.png'), null);
});

test('cover upload: bad type or oversize file is rejected before any storage call', async () => {
  const { client, calls } = mockStorageClient();
  await assert.rejects(
    uploadFormCoverImage('form-1', { name: 'x.pdf', type: 'application/pdf', size: 10, arrayBuffer: PNG }, client),
    /Only JPG, PNG, WebP or GIF/,
  );
  await assert.rejects(
    uploadFormCoverImage(
      'form-1',
      { name: 'big.png', type: 'image/png', size: 6 * 1024 * 1024, arrayBuffer: PNG },
      client,
    ),
    /5 MB or smaller/,
  );
  assert.deepEqual(calls, []);
});

test('cover delete: removes the stored file from the same bucket', async () => {
  const { client, calls } = mockStorageClient();
  await deleteFormCoverImage('forms/form-1/abc.png', client);
  assert.equal(calls[0].bucket, 'course-images');
  assert.equal(calls[0].path, 'forms/form-1/abc.png');
});

// ---------------------------------------------------------------------------
// Item 6 — draft preview access rules
// ---------------------------------------------------------------------------

const ADMIN = { isAdmin: true, role: 'admin' };
const STUDENT = { isAdmin: false, role: 'student' };

test('preview access: admin sees any status, everyone else 404s like an unknown slug', () => {
  assert.equal(isPreviewRequest({ preview: '1' }), true);
  assert.equal(isPreviewRequest({}), false);
  assert.equal(isPreviewRequest({ preview: '0' }), false);
  assert.equal(canPreviewForm(ADMIN), true);
  assert.equal(canPreviewForm(STUDENT), false);
  assert.equal(canPreviewForm(null), false);
  assert.equal(canPreviewForm(undefined), false);
  // A view-as teacher session is not an admin session.
  assert.equal(canPreviewForm({ isAdmin: false, role: 'instructor' }), false);

  assert.deepEqual(decideFormRender({ preview: '1' }, ADMIN), { render: 'any-status' });
  assert.deepEqual(decideFormRender({ preview: '1' }, STUDENT), { render: 'not-found' });
  assert.deepEqual(decideFormRender({ preview: '1' }, null), { render: 'not-found' });
  assert.deepEqual(decideFormRender({ preview: '1' }, undefined), { render: 'not-found' });
  // Normal and embed requests are published-only, for everyone.
  assert.deepEqual(decideFormRender({}, ADMIN), { render: 'published-only' });
  assert.deepEqual(decideFormRender({}, null), { render: 'published-only' });
  assert.deepEqual(decideFormRender({ embed: '1' }, ADMIN), { render: 'published-only' });
  assert.deepEqual(decideFormRender({ embed: '1' }, null), { render: 'published-only' });
  // Preview wins over embed when both are present — and still 404s for non-admins.
  assert.deepEqual(decideFormRender({ preview: '1', embed: '1' }, ADMIN), { render: 'any-status' });
  assert.deepEqual(decideFormRender({ preview: '1', embed: '1' }, null), { render: 'not-found' });
});

test('embed detection: only ?embed=1 on a form page', () => {
  assert.equal(isEmbedRequest({ embed: '1' }), true);
  assert.equal(isEmbedRequest({}), false);
  assert.equal(isEmbedRequest({ embed: '0' }), false);
});

// ---------------------------------------------------------------------------
// Item 7 — share links, embed snippet, framing exemption
// ---------------------------------------------------------------------------

test('share URL: {origin}/forms/{slug}, trailing slash on the origin tolerated', () => {
  assert.equal(buildFormShareUrl('https://codebettle.com', 'spring-2027'), 'https://codebettle.com/forms/spring-2027');
  assert.equal(buildFormShareUrl('https://codebettle.com/', 'spring-2027'), 'https://codebettle.com/forms/spring-2027');
  assert.equal(buildFormShareUrl('http://localhost:3000', 'a-b'), 'http://localhost:3000/forms/a-b');
});

test('embed snippet: exact iframe format, pointing at the embed render', () => {
  assert.equal(
    buildEmbedSnippet('https://codebettle.com', 'spring-2027', 'Spring 2027 Registration'),
    '<iframe src="https://codebettle.com/forms/spring-2027?embed=1" width="100%" height="600" style="border:0" title="Spring 2027 Registration"></iframe>',
  );
  // A form name cannot break out of the title attribute.
  const snippet = buildEmbedSnippet('https://codebettle.com', 'x', 'A "quoted" & <tagged> form');
  assert.ok(!snippet.includes('"quoted"'), 'raw double quotes must be escaped');
  assert.ok(snippet.includes('&quot;quoted&quot;'));
  assert.ok(snippet.includes('&amp;'));
  assert.ok(snippet.includes('?embed=1'));
});

test('framing exemption: ONLY the embed render may be framed', () => {
  assert.equal(shouldAllowFraming('/forms/spring-2027', '1'), true);
  assert.equal(shouldAllowFraming('/forms/spring-2027', null), false);
  assert.equal(shouldAllowFraming('/forms/spring-2027', '0'), false);
  assert.equal(shouldAllowFraming('/forms/', '1'), false);
  assert.equal(shouldAllowFraming('/forms', '1'), false);
  assert.equal(shouldAllowFraming('/admin/forms', '1'), false);
  assert.equal(shouldAllowFraming('/admin/forms/abc/builder', '1'), false);
  assert.equal(shouldAllowFraming('/', '1'), false);
});

test('framing exemption: CSP frame-ancestors flips to * only for the embed render', () => {
  const nonce = 'test-nonce';
  const normal = buildCspHeader(nonce);
  assert.match(normal, /frame-ancestors 'none'/);
  const embed = buildCspHeader(nonce, false, { allowFraming: true });
  assert.match(embed, /frame-ancestors \*/);
  assert.ok(!embed.includes("frame-ancestors 'none'"), 'embed CSP must not forbid framing');
  // The nonce is still stamped in both.
  assert.ok(normal.includes(`'nonce-${nonce}'`));
  assert.ok(embed.includes(`'nonce-${nonce}'`));
});
