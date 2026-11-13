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
  stripBatchSuffixFromCourseName,
  substituteCertificatePlaceholders,
  toTitleCaseName,
} from '../lib/certificates/template';

/**
 * Phase 2 — per-course certificate templates.
 * Template selection (course's own, else the default Python design),
 * batch rules, placeholder substitution, and the course icon.
 */

const TOKEN = 'b'.repeat(32);

test('toTitleCaseName capitalises every first letter of the student name', () => {
  assert.equal(toTitleCaseName('huffy'), 'Huffy');
  assert.equal(toTitleCaseName('muhammad hateem hussain'), 'Muhammad Hateem Hussain');
  assert.equal(toTitleCaseName('zainab nadeem'), 'Zainab Nadeem');
  // All-uppercase normalises too.
  assert.equal(toTitleCaseName('MUHAMMAD HATEEM'), 'Muhammad Hateem');
  // Already mixed-case is left alone — never break a correct "McDonald".
  assert.equal(toTitleCaseName('McDonald'), 'McDonald');
  assert.equal(toTitleCaseName("O'Brien"), "O'Brien");
  // Hyphenated and apostrophe parts capitalise separately.
  assert.equal(toTitleCaseName('mary-jane watson'), 'Mary-Jane Watson');
  assert.equal(toTitleCaseName("o'brien"), "O'Brien");
  // Extra spaces collapse; leading/trailing space is trimmed.
  assert.equal(toTitleCaseName('  muhammad   hateem  '), 'Muhammad Hateem');
  // Empty stays empty.
  assert.equal(toTitleCaseName(''), '');
  assert.equal(toTitleCaseName('   '), '');
});

test('buildCertificateHtml title-cases a lowercase student name', async () => {
  const built = await buildCertificateHtml({
    studentName: 'muhammad hateem hussain',
    courseSlug: 'python-crash-course',
    courseTitle: 'Python Crash Course',
    courseThumbnail: '',
    courseTemplateHtml: null,
    batch: 'BATCH-8',
    certificateNumber: 'CB-2026-008',
    verificationToken: TOKEN,
  });
  const bodyHtml = built.html.split('<body>')[1];
  assert.ok(bodyHtml.includes('Muhammad Hateem Hussain'), 'name must render title-cased');
  assert.ok(!bodyHtml.includes('muhammad hateem hussain'), 'lowercase name must not leak through');
});

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
  // The default template no longer carries {{COURSE_ICON}} — the Python
  // logo next to the course name was removed at the user's request
  // (13 Nov 2026). The placeholder is still supported for custom
  // templates, so findMissingPlaceholders still lists it as missing.
  assert.deepEqual(findMissingPlaceholders(getDefaultTemplateHtml()), ['{{COURSE_ICON}}']);
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

test('stripBatchSuffixFromCourseName removes a trailing " Batch <number>" only', () => {
  assert.equal(stripBatchSuffixFromCourseName('Python Crash Course Batch 09'), 'Python Crash Course');
  assert.equal(stripBatchSuffixFromCourseName('Python Crash Course Batch 9'), 'Python Crash Course');
  assert.equal(stripBatchSuffixFromCourseName('Python Crash Course BATCH 08'), 'Python Crash Course');
  assert.equal(stripBatchSuffixFromCourseName('Python Crash Course Batch 10'), 'Python Crash Course');
  // Trailing whitespace tolerated.
  assert.equal(stripBatchSuffixFromCourseName('Python Crash Course Batch 09   '), 'Python Crash Course');
  // No suffix -> unchanged.
  assert.equal(stripBatchSuffixFromCourseName('Python Crash Course'), 'Python Crash Course');
  assert.equal(stripBatchSuffixFromCourseName('Web Development'), 'Web Development');
  // "Batch" anywhere but the end is left alone.
  assert.equal(stripBatchSuffixFromCourseName('Python Batch 09 Course'), 'Python Batch 09 Course');
  assert.equal(stripBatchSuffixFromCourseName('Batch Processing 101'), 'Batch Processing 101');
  // Stripping must never leave an empty title.
  assert.equal(stripBatchSuffixFromCourseName('Batch 09'), 'Batch 09');
  assert.equal(stripBatchSuffixFromCourseName('Batch 09 '), 'Batch 09 ');
});

test('buildCertificateHtml strips the batch suffix from the course name, batch stays BATCH-8', async () => {
  const built = await buildCertificateHtml({
    studentName: 'huffy',
    courseSlug: 'python-machine-learning',
    courseTitle: 'Python Crash Course Batch 09',
    courseThumbnail: '',
    courseTemplateHtml: null,
    batch: null,
    certificateNumber: 'CB-2026-008',
    verificationToken: TOKEN,
  });
  const bodyHtml = built.html.split('<body>')[1];
  assert.equal(built.batch, 'BATCH-8', 'batch must still be the Python default');
  assert.ok(bodyHtml.includes('PYTHON CRASH COURSE'), 'course name must render without the batch suffix');
  assert.ok(!bodyHtml.includes('BATCH 09'), 'no "BATCH 09" may leak into the certificate');
  assert.ok(bodyHtml.includes('BATCH-8'), 'the batch row must still show BATCH-8');
  assert.ok(bodyHtml.includes('Huffy'), 'name stays title-cased');
});

test('buildCertificateHtml strips the batch suffix in a custom template too (as-is casing)', async () => {
  const built = await buildCertificateHtml({
    studentName: 'Zainab Nadeem',
    courseSlug: 'ghl-automation',
    courseTitle: 'GHL Automation Batch 02',
    courseThumbnail: '',
    courseTemplateHtml: '<html><body>{{STUDENT_NAME}} — {{COURSE_NAME}} — {{BATCH}} — {{QR_CODE}}</body></html>',
    batch: 'BATCH 2',
    certificateNumber: 'CBAIB1002',
    verificationToken: TOKEN,
  });
  assert.equal(built.isDefaultTemplate, false);
  assert.equal(built.batch, 'BATCH 2');
  assert.ok(built.html.includes('GHL Automation'), 'custom template keeps the stripped title as-is');
  assert.ok(!built.html.includes('Batch 02'), 'no batch suffix may leak into a custom template either');
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
