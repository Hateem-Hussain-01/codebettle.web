import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSPARENT_ICON_DATA_URI,
  buildCertificateHtml,
  chooseCertificateTemplate,
  findMissingPlaceholders,
  getDefaultTemplateHtml,
  isPythonCourse,
  resolveBatch,
  resolveCourseIcon,
  substituteCertificatePlaceholders,
} from '../lib/certificates/template';

/**
 * Phase 2 — per-course certificate templates.
 * Template selection (course's own, else the default Python design),
 * batch rules, placeholder substitution, and the course icon.
 */

const TOKEN = 'b'.repeat(32);

test('isPythonCourse matches slug or title, case-insensitively', () => {
  assert.equal(isPythonCourse('python', 'Python'), true);
  assert.equal(isPythonCourse('py-101', 'Python Programming'), true);
  assert.equal(isPythonCourse('web-101', 'Web 101'), false);
});

test('chooseCertificateTemplate prefers the course template, else the default', () => {
  const custom = chooseCertificateTemplate('<html>custom {{STUDENT_NAME}}</html>');
  assert.equal(custom.isDefault, false);
  assert.equal(custom.html, '<html>custom {{STUDENT_NAME}}</html>');
  assert.equal(chooseCertificateTemplate(null).isDefault, true);
  assert.equal(chooseCertificateTemplate('   ').isDefault, true);
  const def = getDefaultTemplateHtml();
  assert.equal(chooseCertificateTemplate(undefined).html, def);
  assert.ok(def.includes('CERTIFICATE'), 'default template should be the Python design');
  assert.ok(def.includes('{{STUDENT_NAME}}'), 'default template carries the placeholders');
});

test('findMissingPlaceholders lists what a template lacks (warn-only)', () => {
  assert.deepEqual(findMissingPlaceholders('<html>{{STUDENT_NAME}}</html>'), [
    '{{COURSE_NAME}}',
    '{{COURSE_ICON}}',
    '{{BATCH}}',
    '{{CERTIFICATE_NUMBER}}',
    '{{SIGNATURE_NAME}}',
    '{{SIGNATURE_TITLE}}',
    '{{QR_CODE}}',
  ]);
  assert.deepEqual(findMissingPlaceholders(getDefaultTemplateHtml()), []);
});

test('resolveBatch: stored batch wins, else BATCH-8 for Python, else none', () => {
  assert.equal(resolveBatch('BATCH-3', 'python', 'Python'), 'BATCH-3');
  assert.equal(resolveBatch(null, 'python', 'Python'), 'BATCH-8');
  assert.equal(resolveBatch(undefined, 'web-101', 'Web 101'), null);
  assert.equal(resolveBatch('  ', 'web-101', 'Web 101'), null);
});

test('substituteCertificatePlaceholders replaces all eight and escapes text', () => {
  const html = '<p>{{STUDENT_NAME}} {{COURSE_NAME}} {{COURSE_ICON}} {{BATCH}} {{CERTIFICATE_NUMBER}} {{SIGNATURE_NAME}} {{SIGNATURE_TITLE}} {{QR_CODE}}</p>';
  const out = substituteCertificatePlaceholders(html, {
    studentName: 'Ali <b>&</b> Sons',
    courseName: 'PYTHON',
    courseIcon: 'data:image/png;base64,AAA',
    batch: 'BATCH-8',
    certificateNumber: 'CB-2026-001',
    signatureName: 'Ahmad',
    signatureTitle: 'CEO',
    qrCode: 'data:image/png;base64,BBB',
  });
  assert.ok(!out.includes('{{'), 'no placeholder may survive substitution');
  assert.ok(out.includes('Ali &lt;b&gt;&amp;&lt;/b&gt; Sons'), 'student name must be HTML-escaped');
  assert.ok(out.includes('BATCH-8'));
  assert.ok(out.includes('data:image/png;base64,AAA'), 'data URIs pass through unescaped');
  assert.ok(!out.includes('display:none'), 'batch row stays visible when a batch exists');
});

test('substituteCertificatePlaceholders hides the batch row when there is no batch', () => {
  const html = '<head></head><div class="batch-row"><span>{{BATCH}}</span></div>';
  const out = substituteCertificatePlaceholders(html, {
    studentName: 'Ali',
    courseName: 'WEB 101',
    courseIcon: 'x',
    batch: null,
    certificateNumber: 'CB-2026-001',
    signatureName: 'Ahmad',
    signatureTitle: 'CEO',
    qrCode: 'y',
  });
  assert.ok(!out.includes('{{BATCH}}'));
  assert.ok(out.includes('.batch-row{display:none!important}'), 'batch row must be hidden, not left as an empty gold row');
});

test('resolveCourseIcon: Python gets the logo asset, others fall back transparent', async () => {
  const python = await resolveCourseIcon('python', 'Python', '');
  assert.ok(python.startsWith('data:image/png;base64,'), 'Python icon must be a data URI');
  assert.deepEqual(
    [...Buffer.from(python.split(',')[1], 'base64').subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    'Python icon must decode as a PNG',
  );
  assert.equal(await resolveCourseIcon('web-101', 'Web 101', ''), TRANSPARENT_ICON_DATA_URI);
  // Unreachable thumbnail -> transparent, never a throw.
  assert.equal(
    await resolveCourseIcon('web-101', 'Web 101', 'http://localhost:1/thumb.png'),
    TRANSPARENT_ICON_DATA_URI,
  );
});

test('buildCertificateHtml: sample Python certificate uses the default design', async () => {
  // NOTE: this deliberately uses NON-sample data (not Zohaib Hassan /
  // CBB8CNo801) — the template body must carry real placeholders, so
  // sample values must never leak into a certificate for someone else.
  const built = await buildCertificateHtml({
    studentName: 'Ayesha Khan',
    courseSlug: 'python',
    courseTitle: 'Python',
    courseThumbnail: '',
    courseTemplateHtml: null,
    batch: null,
    certificateNumber: 'CB-2026-042',
    verificationToken: TOKEN,
  });
  assert.equal(built.isDefaultTemplate, true);
  assert.equal(built.batch, 'BATCH-8');
  assert.equal(built.verifyUrl, `https://codebettle-web.vercel.app/verify/${TOKEN}`);
  assert.ok(built.html.includes('Ayesha Khan'));
  assert.ok(built.html.includes('PYTHON'), 'default design prints the course name uppercased');
  assert.ok(built.html.includes('CB-2026-042'));
  assert.ok(built.html.includes('BATCH-8'));
  assert.ok(built.html.includes('data:image/png;base64,'), 'QR data URI must be embedded');
  assert.ok(!built.html.includes('{{'), 'no placeholder may survive');
  // The header comment still documents the sample values — check the
  // BODY only: no sample value may leak into another student's cert.
  const bodyHtml = built.html.split('<body>')[1];
  assert.ok(bodyHtml.includes('Ayesha Khan'));
  assert.ok(bodyHtml.includes('CB-2026-042'));
  assert.ok(!bodyHtml.includes('Zohaib Hassan'), 'sample name must not leak into another student’s certificate');
  assert.ok(!bodyHtml.includes('CBB8CNo801'), 'sample certificate number must not leak');
});

test('buildCertificateHtml: a custom template is used as-is (title casing kept)', async () => {
  const built = await buildCertificateHtml({
    studentName: 'Zainab Nadeem',
    courseSlug: 'ghl-automation',
    courseTitle: 'GHL Automation',
    courseThumbnail: '',
    courseTemplateHtml: '<html><body>{{STUDENT_NAME}} — {{COURSE_NAME}} — {{BATCH}} — {{QR_CODE}}</body></html>',
    batch: 'BATCH 1',
    certificateNumber: 'CBAIB1002',
    verificationToken: TOKEN,
  });
  assert.equal(built.isDefaultTemplate, false);
  assert.equal(built.batch, 'BATCH 1');
  assert.ok(built.html.includes('GHL Automation'), 'custom template keeps the title as-is');
  assert.ok(!built.html.includes('{{'));
});
