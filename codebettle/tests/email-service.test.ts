import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAppBaseUrl,
  getEmailFrom,
  isEmailConfigured,
  sendEmail,
  sendNotificationEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  type EmailTransport,
} from '../lib/email/resend';
import {
  notificationEmail,
  passwordResetEmail,
  verificationEmail,
} from '../lib/email/templates';

const ORIGINAL_KEY = process.env.RESEND_API_KEY;
const ORIGINAL_FROM = process.env.EMAIL_FROM;
const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

function setKey(value: string | undefined): void {
  if (value === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = value;
}

test.afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_FROM === undefined) delete process.env.EMAIL_FROM;
  else process.env.EMAIL_FROM = ORIGINAL_FROM;
  if (ORIGINAL_APP_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
});

test('sendEmail: with a key and a fake transport, the message is sent and the payload is complete', async () => {
  setKey('re_test_key');
  const seen: unknown[] = [];
  const transport: EmailTransport = async (input) => {
    seen.push(input);
    return { id: 'msg_123' };
  };
  const result = await sendEmail(
    { to: 'student@example.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' },
    { transport },
  );
  assert.deepEqual(result, { sent: true, reason: 'sent', id: 'msg_123' });
  assert.equal(seen.length, 1);
  const sent = seen[0] as { from: string; to: string; subject: string; html: string };
  assert.equal(sent.from, 'CodeBettle <noreply@codebettle.com>');
  assert.equal(sent.to, 'student@example.com');
  assert.equal(sent.subject, 'Hi');
  assert.equal(sent.html, '<p>Hi</p>');
});

test('sendEmail: without a key, nothing is sent and the transport is never called', async () => {
  setKey(undefined);
  let called = false;
  const transport: EmailTransport = async () => {
    called = true;
    return { id: 'msg_123' };
  };
  const result = await sendEmail(
    { to: 'student@example.com', subject: 'Hi', html: '<p>Hi</p>' },
    { transport },
  );
  assert.deepEqual(result, { sent: false, reason: 'email-not-configured' });
  assert.equal(called, false);
  assert.equal(isEmailConfigured(), false);
});

test('sendEmail: a throwing transport fails gracefully instead of throwing', async () => {
  setKey('re_test_key');
  const transport: EmailTransport = async () => {
    throw new Error('network down');
  };
  const result = await sendEmail(
    { to: 'student@example.com', subject: 'Hi', html: '<p>Hi</p>' },
    { transport },
  );
  assert.deepEqual(result, { sent: false, reason: 'email-send-failed' });
});

test('sendEmail: a transport error result fails gracefully', async () => {
  setKey('re_test_key');
  const transport: EmailTransport = async () => ({ error: 'Invalid `from` address.' });
  const result = await sendEmail(
    { to: 'student@example.com', subject: 'Hi', html: '<p>Hi</p>' },
    { transport },
  );
  assert.deepEqual(result, { sent: false, reason: 'email-send-failed' });
});

test('verification template: dark/gold HTML with a Verify button and the link, plus a text fallback', () => {
  const url = 'https://codebettle-web.vercel.app/auth/verify-email?token=abc123';
  const tpl = verificationEmail({ name: 'Ali Raza', verifyUrl: url });
  assert.equal(tpl.subject, 'Verify your CodeBettle email');
  assert.match(tpl.html, /Verify your email/);
  assert.ok(tpl.html.includes(url), 'html carries the verification link');
  assert.ok(tpl.html.includes('#0A0A0A'), 'dark background');
  assert.ok(tpl.html.includes('#F5C518'), 'gold accent');
  assert.ok(tpl.html.includes('width=device-width'), 'mobile viewport');
  assert.ok(tpl.html.includes('Hi Ali Raza,'), 'personalised greeting');
  assert.ok(tpl.text.includes(url), 'text part carries the link');
});

test('password-reset template: HTML with the reset link and 60-minute expiry', () => {
  const url = 'https://codebettle-web.vercel.app/auth/reset?token=def456';
  const tpl = passwordResetEmail({ name: 'Sara', resetUrl: url });
  assert.equal(tpl.subject, 'Reset your CodeBettle password');
  assert.ok(tpl.html.includes(url));
  assert.match(tpl.html, /60 minutes/);
  assert.ok(tpl.text.includes(url));
});

test('notification template: subject is the title, body is escaped HTML', () => {
  const tpl = notificationEmail({
    title: "You're enrolled in React Basics",
    body: '<script>alert(1)</script> Welcome!',
    siteUrl: 'https://codebettle-web.vercel.app',
  });
  assert.equal(tpl.subject, "You're enrolled in React Basics");
  assert.ok(!tpl.html.includes('<script>alert(1)</script>'), 'body is escaped');
  assert.ok(tpl.html.includes('Welcome!'));
});

test('sendVerificationEmail builds the /auth/verify-email link (never /verify/[token])', async () => {
  setKey('re_test_key');
  let captured = '';
  const transport: EmailTransport = async (input) => {
    captured = input.html;
    return { id: 'msg_1' };
  };
  const result = await sendVerificationEmail(
    'student@example.com',
    'Ali',
    'tok123',
    'https://codebettle-web.vercel.app',
    { transport },
  );
  assert.equal(result.sent, true);
  assert.ok(captured.includes('/auth/verify-email?token=tok123'));
  assert.ok(!captured.includes('/verify/tok123'));
});

test('sendPasswordResetEmail builds the /auth/reset link', async () => {
  setKey('re_test_key');
  let captured = '';
  const transport: EmailTransport = async (input) => {
    captured = input.html;
    return { id: 'msg_2' };
  };
  const result = await sendPasswordResetEmail(
    'student@example.com',
    'Ali',
    'tok456',
    'https://codebettle-web.vercel.app',
    { transport },
  );
  assert.equal(result.sent, true);
  assert.ok(captured.includes('/auth/reset?token=tok456'));
});

test('sendNotificationEmail mirrors the in-app notification by email', async () => {
  setKey('re_test_key');
  let capturedSubject = '';
  const transport: EmailTransport = async (input) => {
    capturedSubject = input.subject;
    return { id: 'msg_3' };
  };
  const result = await sendNotificationEmail(
    'student@example.com',
    'Certificate issued',
    'Your certificate is ready.',
    { transport },
  );
  assert.equal(result.sent, true);
  assert.equal(capturedSubject, 'Certificate issued');
});

test('getAppBaseUrl: explicit origin wins, env next, production default last', () => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://staging.example.com/';
  assert.equal(getAppBaseUrl('https://shop.example.com/'), 'https://shop.example.com');
  assert.equal(getAppBaseUrl(), 'https://staging.example.com');
  delete process.env.NEXT_PUBLIC_APP_URL;
  assert.equal(getAppBaseUrl(), 'https://codebettle-web.vercel.app');
});

test('getEmailFrom: EMAIL_FROM wins, noreply default otherwise', () => {
  process.env.EMAIL_FROM = 'CodeBettle <hello@codebettle.com>';
  assert.equal(getEmailFrom(), 'CodeBettle <hello@codebettle.com>');
  delete process.env.EMAIL_FROM;
  assert.equal(getEmailFrom(), 'CodeBettle <noreply@codebettle.com>');
});
