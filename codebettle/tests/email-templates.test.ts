import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  EMAIL_PLACEHOLDERS,
  buildPlaceholderValues,
  resolvePlaceholders,
  resolveTemplateContent,
  samplePlaceholderValues,
} from '../lib/email/placeholders';
import {
  EMAIL_HEADER_IMAGE_DATA_URI,
  adminInvitationEmail,
  emailLayout,
  notificationEmail,
  passwordResetEmail,
  verificationEmail,
} from '../lib/email/templates';
import {
  createEmailTemplateService,
  deleteEmailTemplateService,
  listEmailTemplatesService,
  renderEmailTemplate,
  sendTestEmailService,
  templateHtmlToText,
  updateEmailTemplateService,
} from '../lib/services/email-template-service';
import { sendAdminNotification } from '../lib/services/notification-service';
import { listNotificationsForUser } from '../lib/db/notifications';
import { SYSTEM_EMAILS } from '../lib/email/registry';
import { sanitizeEmailHtml } from '../lib/sanitize';
import type { Actor } from '../lib/services/errors';

const D = (s: string) => new Date(s);
const ADMIN: Actor = { id: 'admin-1', role: 'admin', name: 'Admin' };
const STUDENT: Actor = { id: 'stu-1', role: 'student', name: 'Ali' };

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  delete process.env.RESEND_API_KEY;
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-03') },
  ]);
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'web-101', title: 'Web 101', description: 'Intro', longDescription: '',
      thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 2, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
    { id: 'enr-2', studentId: 'stu-2', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
  delete process.env.RESEND_API_KEY;
});

// ---------------------------------------------------------------------------
// Placeholder engine
// ---------------------------------------------------------------------------

test('placeholders: every documented placeholder key is offered by the builder', () => {
  const keys = EMAIL_PLACEHOLDERS.map((p) => p.key);
  for (const expected of [
    'STUDENT_NAME', 'STUDENT_EMAIL', 'COURSE_NAME', 'TEACHER_NAME', 'VERIFY_URL',
    'RESET_URL', 'SITE_URL', 'ADMIN_NAME', 'ENROLLMENT_DATE', 'CERTIFICATE_NUMBER', 'BATCH',
  ]) {
    assert.ok(keys.includes(expected), `missing placeholder ${expected}`);
  }
  assert.equal(new Set(keys).size, keys.length, 'placeholder keys must be unique');
});

test('placeholders: substitution from real values', () => {
  const values = buildPlaceholderValues({
    student: { name: 'Ali Raza', email: 'ali@example.com' },
    course: { title: 'Web 101' },
    teacher: { name: 'Usman' },
    siteUrl: 'https://codebettle-web.vercel.app',
  });
  assert.equal(
    resolvePlaceholders('Hi {{STUDENT_NAME}}, welcome to {{COURSE_NAME}} with {{TEACHER_NAME}}.', values),
    'Hi Ali Raza, welcome to Web 101 with Usman.',
  );
  assert.equal(
    resolvePlaceholders('Your email is {{STUDENT_EMAIL}} — visit {{SITE_URL}}.', values),
    'Your email is ali@example.com — visit https://codebettle-web.vercel.app.',
  );
});

test('placeholders: user-supplied values are HTML-escaped', () => {
  const values = buildPlaceholderValues({ student: { name: '<script>alert(1)</script>' } });
  const out = resolvePlaceholders('<p>Hi {{STUDENT_NAME}}</p>', values);
  assert.ok(!out.includes('<script>'), out);
  assert.ok(out.includes('&lt;script&gt;'), out);
  // Plain-text (subject) resolution does not escape.
  const subject = resolvePlaceholders('Hi {{STUDENT_NAME}}', values, { escape: false });
  assert.equal(subject, 'Hi <script>alert(1)</script>');
});

test('placeholders: unknown tokens are left untouched, known-but-empty resolve to empty', () => {
  const values = buildPlaceholderValues({ student: { name: 'Ali' } });
  assert.equal(
    resolvePlaceholders('Hi {{STUDENT_NAME}}, {{MADE_UP}} stays.', values),
    'Hi Ali, {{MADE_UP}} stays.',
  );
  assert.equal(
    resolvePlaceholders('Course: {{COURSE_NAME}}.', values),
    'Course: .',
  );
});

test('placeholders: enrollment date + certificate values resolve from rows', () => {
  const values = buildPlaceholderValues({
    enrollment: { enrolledAt: new Date('2026-11-13T10:00:00Z') },
    certificate: { certificateNumber: 'CB-2026-008', batch: 'BATCH-8' },
  });
  assert.equal(values.ENROLLMENT_DATE, '2026-11-13');
  assert.equal(values.CERTIFICATE_NUMBER, 'CB-2026-008');
  assert.equal(values.BATCH, 'BATCH-8');
  assert.equal(
    resolvePlaceholders('Enrolled {{ENROLLMENT_DATE}}, certificate {{CERTIFICATE_NUMBER}} ({{BATCH}}).', values),
    'Enrolled 2026-11-13, certificate CB-2026-008 (BATCH-8).',
  );
});

test('placeholders: resolveTemplateContent resolves subject + body together', () => {
  const out = resolveTemplateContent(
    { subject: 'Welcome, {{STUDENT_NAME}}!', htmlBody: '<p>Hi {{STUDENT_NAME}}, see {{COURSE_NAME}}.</p>' },
    { STUDENT_NAME: 'Sara', COURSE_NAME: 'Web 101' },
  );
  assert.equal(out.subject, 'Welcome, Sara!');
  assert.equal(out.htmlBody, '<p>Hi Sara, see Web 101.</p>');
});

// ---------------------------------------------------------------------------
// Restyled templates (Part 1)
// ---------------------------------------------------------------------------

test('templates: verification email keeps its button + link in the restyled layout', () => {
  const url = 'https://codebettle-web.vercel.app/auth/verify-email?token=abc123';
  const t = verificationEmail({ name: 'Ali', verifyUrl: url });
  assert.equal(t.subject, 'Verify your CodeBettle email');
  assert.ok(t.html.includes('Verify your email'), 'CTA label present');
  assert.ok(t.html.includes(url), 'verify URL present in HTML');
  assert.ok(t.html.includes('CodeBettle'), 'branded header present');
  assert.ok(t.html.includes('#F5C518'), 'gold brand colour present');
  assert.ok(t.html.includes('Learn. Build. Ship.'), 'tagline present');
  assert.ok(t.html.includes('https://codebettle-web.vercel.app'), 'footer site link present');
  assert.ok(t.text.includes(url), 'plain-text part carries the link');
  assert.ok(!/<img[^>]+src="https?:/.test(t.html), 'no external image URLs in the email');
});

test('templates: password reset + invitation + notification all render in the restyled layout', () => {
  const reset = passwordResetEmail({ name: 'Ali', resetUrl: 'https://codebettle-web.vercel.app/auth/reset?token=x' });
  assert.ok(reset.html.includes('Reset your password'));
  assert.ok(reset.html.includes('#F5C518'));
  assert.ok(reset.text.includes('https://codebettle-web.vercel.app/auth/reset?token=x'));

  const invite = adminInvitationEmail({ name: 'Ahmad', inviteUrl: 'https://codebettle-web.vercel.app/auth/accept-invitation?token=y', expiresInDays: 7 });
  assert.ok(invite.html.includes('Set your password and join'));
  assert.ok(invite.html.includes('7 days'));

  const note = notificationEmail({ title: 'New enrollment', body: 'A student enrolled.', siteUrl: 'https://codebettle-web.vercel.app' });
  assert.equal(note.subject, 'New enrollment');
  assert.ok(note.html.includes('Open CodeBettle'));
  assert.ok(note.text.includes('A student enrolled.'));
});

test('templates: header image is embedded as a base64 data URI in every email', () => {
  assert.ok(
    EMAIL_HEADER_IMAGE_DATA_URI.startsWith('data:image/jpeg;base64,'),
    'header image must be an embedded JPEG data URI',
  );
  assert.ok(EMAIL_HEADER_IMAGE_DATA_URI.length > 10_000, 'embedded header must be a real image');
  const html = emailLayout({ preheader: 'Hi', heading: 'Hello', bodyHtml: '<p>Body</p>' });
  assert.ok(html.includes('data:image/jpeg;base64,'), 'layout renders the embedded header image');
  assert.ok(!/<img[^>]+src="https?:/.test(html), 'no external image in the layout');
  const t = verificationEmail({ name: 'Ali', verifyUrl: 'https://codebettle-web.vercel.app/auth/verify-email?token=x' });
  assert.ok(t.html.includes('data:image/jpeg;base64,'), 'verification email carries the header image');
});

test('templates: templateHtmlToText strips tags for the plain-text part', () => {
  assert.equal(
    templateHtmlToText('<p>Hi Ali,</p><p>Welcome to <b>Web 101</b>!</p>'),
    'Hi Ali,\nWelcome to Web 101!',
  );
  assert.equal(templateHtmlToText('Fish &amp; Chips'), 'Fish & Chips');
});

// ---------------------------------------------------------------------------
// Template rendering (builder)
// ---------------------------------------------------------------------------

test('renderEmailTemplate: resolves placeholders and wraps in the branded layout', () => {
  const rendered = renderEmailTemplate(
    {
      name: 'Welcome',
      subject: 'Welcome, {{STUDENT_NAME}}!',
      htmlBody: '<p>Hi {{STUDENT_NAME}}, welcome to {{COURSE_NAME}}.</p>',
    },
    samplePlaceholderValues('https://codebettle-web.vercel.app'),
    'https://codebettle-web.vercel.app',
  );
  assert.equal(rendered.subject, 'Welcome, Ali Raza!');
  assert.ok(rendered.html.includes('Hi Ali Raza, welcome to Python Crash Course Batch 09.'));
  assert.ok(rendered.html.includes('CodeBettle'), 'branded layout wraps the body');
  assert.ok(rendered.text.includes('Hi Ali Raza, welcome to Python Crash Course Batch 09.'));
});

// ---------------------------------------------------------------------------
// Template service (CRUD + test email)
// ---------------------------------------------------------------------------

test('templates service: create/list/get/update/delete round-trip', async () => {
  const created = await createEmailTemplateService(ADMIN, {
    name: 'Welcome',
    subject: 'Welcome, {{STUDENT_NAME}}!',
    htmlBody: '<p>Hi {{STUDENT_NAME}}!</p>',
  });
  assert.ok('template' in created, JSON.stringify(created));
  const id = created.template.id;
  assert.equal(created.template.type, 'broadcast');
  assert.equal(created.template.isActive, true);

  const listed = await listEmailTemplatesService(ADMIN);
  assert.ok('templates' in listed, JSON.stringify(listed));
  assert.equal(listed.templates.length, 1);
  assert.equal(listed.tableMissing, false);

  const updated = await updateEmailTemplateService(ADMIN, id, { subject: 'Hello, {{STUDENT_NAME}}!' });
  assert.ok('template' in updated, JSON.stringify(updated));
  assert.equal(updated.template.subject, 'Hello, {{STUDENT_NAME}}!');

  const deleted = await deleteEmailTemplateService(ADMIN, id);
  assert.ok('success' in deleted, JSON.stringify(deleted));
  const after = await listEmailTemplatesService(ADMIN);
  assert.ok('templates' in after);
  assert.equal(after.templates.length, 0);
});

test('templates service: validation rejects empty name/subject/body and bad type', async () => {
  const noName = await createEmailTemplateService(ADMIN, { name: ' ', subject: 'Hi', htmlBody: '<p>x</p>' });
  assert.ok('error' in noName, JSON.stringify(noName));
  const noSubject = await createEmailTemplateService(ADMIN, { name: 'x', subject: '', htmlBody: '<p>x</p>' });
  assert.ok('error' in noSubject, JSON.stringify(noSubject));
  const noBody = await createEmailTemplateService(ADMIN, { name: 'x', subject: 'Hi', htmlBody: '  ' });
  assert.ok('error' in noBody, JSON.stringify(noBody));
  const badType = await createEmailTemplateService(ADMIN, {
    name: 'x', subject: 'Hi', htmlBody: '<p>x</p>', type: 'nope' as never,
  });
  assert.ok('error' in badType, JSON.stringify(badType));
});

test('templates service: a non-admin cannot manage templates', async () => {
  const result = await createEmailTemplateService(STUDENT, {
    name: 'x', subject: 'Hi', htmlBody: '<p>x</p>',
  });
  assert.ok('error' in result, JSON.stringify(result));
  assert.equal(result.error, 'Only admins can manage email templates');
  const listed = await listEmailTemplatesService(STUDENT);
  assert.ok('error' in listed, JSON.stringify(listed));
});

test('templates service: test email is inert without Resend (never throws, never blocks)', async () => {
  const created = await createEmailTemplateService(ADMIN, {
    name: 'Welcome', subject: 'Hi {{STUDENT_NAME}}', htmlBody: '<p>Hi {{STUDENT_NAME}}!</p>',
  });
  assert.ok('template' in created, JSON.stringify(created));
  const sent = await sendTestEmailService(ADMIN, created.template.id, 'admin@codebettle.com');
  assert.ok('sent' in sent, JSON.stringify(sent));
  assert.equal(sent.sent, false);
  assert.equal(sent.reason, 'email-not-configured');
});

// ---------------------------------------------------------------------------
// Broadcast wiring: template picked in sendAdminNotification
// ---------------------------------------------------------------------------

test('broadcast: a picked template resolves placeholders per recipient', async () => {
  const created = await createEmailTemplateService(ADMIN, {
    name: 'Course news',
    subject: 'News for {{STUDENT_NAME}}',
    htmlBody: '<p>Hi {{STUDENT_NAME}}, news about {{COURSE_NAME}}!</p>',
  });
  assert.ok('template' in created, JSON.stringify(created));
  const summary = await sendAdminNotification({
    title: '',
    body: '',
    category: 'general',
    target: { type: 'course', courseId: 'course-1' },
    templateId: created.template.id,
  });
  assert.ok(summary.ok, JSON.stringify(summary));
  assert.equal(summary.sent, 2, JSON.stringify(summary));

  const ali = await listNotificationsForUser('stu-1', {});
  assert.equal(ali.total, 1);
  assert.equal(ali.items[0].title, 'News for Ali');
  assert.ok(ali.items[0].body.includes('Hi Ali, news about Web 101!'), ali.items[0].body);

  const sara = await listNotificationsForUser('stu-2', {});
  assert.equal(sara.total, 1);
  assert.equal(sara.items[0].title, 'News for Sara');
  assert.ok(sara.items[0].body.includes('Hi Sara, news about Web 101!'), sara.items[0].body);
});

test('broadcast: an unknown template id fails gracefully (no crash, no rows)', async () => {
  const summary = await sendAdminNotification({
    title: '',
    body: '',
    category: 'general',
    target: { type: 'all' },
    templateId: 'does-not-exist',
  });
  assert.equal(summary.ok, false);
  assert.equal(summary.sent, 0);
  const ali = await listNotificationsForUser('stu-1', {});
  assert.equal(ali.total, 0);
});

// ---------------------------------------------------------------------------
// Email sanitizer (builder)
// ---------------------------------------------------------------------------

test('sanitizeEmailHtml: keeps embedded images, drops external images, scripts and javascript: links', () => {
  const out = sanitizeEmailHtml(
    '<p>Hi</p>' +
      '<img src="data:image/png;base64,AAA" alt="logo">' +
      '<img src="https://evil.example.com/x.png">' +
      '<script>alert(1)</script>' +
      '<a href="javascript:alert(1)">bad</a>' +
      '<a href="https://codebettle.com">good</a>' +
      '<p onclick="alert(1)">click</p>',
  );
  assert.ok(out.includes('data:image/png;base64,AAA'), 'embedded image kept');
  assert.ok(out.includes('max-width'), 'embedded image constrained to email width');
  assert.ok(!out.includes('evil.example.com'), 'external image removed');
  assert.ok(!out.includes('<script'), 'script removed');
  assert.ok(!out.includes('javascript:'), 'javascript: link removed');
  assert.ok(!out.includes('onclick'), 'event handler removed');
  assert.ok(out.includes('href="https://codebettle.com"'), 'normal link kept');
});

test('renderEmailTemplate: sanitizes a stored body at render time', () => {
  const rendered = renderEmailTemplate(
    {
      name: 'Tricky',
      subject: 'Hi {{STUDENT_NAME}}',
      htmlBody: '<p>Hi {{STUDENT_NAME}}!</p><script>alert(1)</script><img src="https://evil.example.com/x.png">',
    },
    samplePlaceholderValues('https://codebettle-web.vercel.app'),
    'https://codebettle-web.vercel.app',
  );
  assert.ok(rendered.html.includes('Hi Ali Raza!'));
  assert.ok(!rendered.html.includes('<script'), 'script stripped at render');
  assert.ok(!rendered.html.includes('evil.example.com'), 'external image stripped at render');
  assert.ok(rendered.html.includes('data:image/jpeg;base64,'), 'header image still embedded');
});

// ---------------------------------------------------------------------------
// System email registry (management list)
// ---------------------------------------------------------------------------

test('registry: every system email has a name, purpose, trigger, recipient and active status', () => {
  assert.ok(SYSTEM_EMAILS.length >= 10, `expected at least 10 system emails, got ${SYSTEM_EMAILS.length}`);
  const keys = SYSTEM_EMAILS.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length, 'registry keys must be unique');
  for (const entry of SYSTEM_EMAILS) {
    assert.ok(entry.name.trim(), `${entry.key}: name required`);
    assert.ok(entry.purpose.trim(), `${entry.key}: purpose required`);
    assert.ok(entry.trigger.trim(), `${entry.key}: trigger required`);
    assert.ok(entry.recipient.trim(), `${entry.key}: recipient required`);
    assert.equal(typeof entry.active, 'boolean', `${entry.key}: active must be a boolean`);
  }
  const names = SYSTEM_EMAILS.map((e) => e.key);
  for (const expected of [
    'verification', 'password-reset', 'admin-invitation', 'enrollment',
    'teacher-enrollment', 'completion', 'certificate', 'payment-approved',
    'payment-rejected', 'announcement', 'support-created', 'support-update',
    'form-submission', 'application-reviewed', 'applicant-update',
  ]) {
    assert.ok(names.includes(expected), `registry missing ${expected}`);
  }
  // The teacher enrollment alert is in the registry with its no-fee rule in the purpose.
  const teacherAlert = SYSTEM_EMAILS.find((e) => e.key === 'teacher-enrollment');
  assert.ok(teacherAlert?.purpose.toLowerCase().includes('never the fee'), 'teacher alert purpose states the no-fee rule');
  assert.equal(teacherAlert?.recipient, 'Teacher');
});
