// Phase 3 — notification UI helpers (Worker B).
//
// Pure-function tests for the login popup, notifications list and admin
// compose form. The components themselves call Worker A's new APIs
// (?pending=true, acknowledge, admin compose), which do not exist yet
// in this tree — these tests cover the client-side logic that does not
// depend on those endpoints, plus static wiring checks for the mount
// point and badge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildComposePayload,
  buildNotificationsQuery,
  categoryLabel,
  defaultRequiresAcknowledge,
  formatNotificationDateTime,
  headingForCategory,
  needsAcknowledgement,
  normaliseCategory,
  type ComposeFormState,
} from '../components/notifications/notification-helpers';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const baseForm = (): ComposeFormState => ({
  title: 'Maintenance tonight',
  body: 'The site will be down for an hour.',
  category: 'general',
  targetType: 'all',
  role: 'student',
  userId: '',
  courseId: '',
  requiresAcknowledge: false,
  linkUrl: '',
});

// ---------------------------------------------------------------- categories

test('normaliseCategory: known values pass through, missing/unknown -> general', () => {
  assert.equal(normaliseCategory('important'), 'important');
  assert.equal(normaliseCategory('warning'), 'warning');
  assert.equal(normaliseCategory('special_notice'), 'special_notice');
  assert.equal(normaliseCategory('general'), 'general');
  assert.equal(normaliseCategory(undefined), 'general');
  assert.equal(normaliseCategory(null), 'general');
  assert.equal(normaliseCategory('bogus'), 'general');
});

test('headingForCategory: popup headings per category, null for general', () => {
  assert.equal(headingForCategory('important'), 'Important Notice');
  assert.equal(headingForCategory('special_notice'), 'Special Notification');
  assert.equal(headingForCategory('warning'), 'Warning');
  assert.equal(headingForCategory('general'), null);
  assert.equal(headingForCategory(undefined), null);
});

test('categoryLabel: list chips per category, General fallback', () => {
  assert.equal(categoryLabel('important'), 'Important');
  assert.equal(categoryLabel('special_notice'), 'Special Notice');
  assert.equal(categoryLabel('warning'), 'Warning');
  assert.equal(categoryLabel('general'), 'General');
  assert.equal(categoryLabel(undefined), 'General');
});

test('defaultRequiresAcknowledge: ON for Important / Special Notice, OFF otherwise', () => {
  assert.equal(defaultRequiresAcknowledge('important'), true);
  assert.equal(defaultRequiresAcknowledge('special_notice'), true);
  assert.equal(defaultRequiresAcknowledge('general'), false);
  assert.equal(defaultRequiresAcknowledge('warning'), false);
  assert.equal(defaultRequiresAcknowledge(undefined), false);
});

test('needsAcknowledgement: true only when required and not yet acknowledged', () => {
  const base = { id: 'n1', type: 'announcement', title: 'T', body: 'B', createdAt: '2026-11-12' };
  assert.equal(needsAcknowledgement({ ...base, requiresAcknowledge: true }), true);
  assert.equal(
    needsAcknowledgement({ ...base, requiresAcknowledge: true, acknowledgedAt: '2026-11-12' }),
    false,
  );
  assert.equal(needsAcknowledgement({ ...base, requiresAcknowledge: false }), false);
  assert.equal(needsAcknowledgement({ ...base }), false);
});

test('formatNotificationDateTime: formats a valid date, passes garbage through', () => {
  const out = formatNotificationDateTime('2026-11-12T09:41:00.000Z');
  assert.match(out, /2026/);
  assert.match(out, /Nov/);
  assert.equal(formatNotificationDateTime('not-a-date'), 'not-a-date');
});

// ---------------------------------------------------------------- list query

test('buildNotificationsQuery: type/category/page params, empty when no filters', () => {
  assert.equal(buildNotificationsQuery({}), '/api/notifications');
  assert.equal(
    buildNotificationsQuery({ type: 'announcement', category: 'important', page: 2 }),
    '/api/notifications?type=announcement&category=important&page=2',
  );
  assert.equal(buildNotificationsQuery({ page: 1 }), '/api/notifications?page=1');
});

// ---------------------------------------------------------------- compose payload

test('buildComposePayload: all-users payload shape', () => {
  const res = buildComposePayload(baseForm());
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.body, {
    title: 'Maintenance tonight',
    body: 'The site will be down for an hour.',
    category: 'general',
    target: { type: 'all' },
    requiresAcknowledge: false,
  });
});

test('buildComposePayload: role / user / course targets carry their ids', () => {
  const role = buildComposePayload({ ...baseForm(), targetType: 'role', role: 'instructor' });
  assert.equal(role.ok, true);
  if (role.ok) assert.deepEqual(role.body.target, { type: 'role', role: 'instructor' });

  const user = buildComposePayload({ ...baseForm(), targetType: 'user', userId: 'u-1' });
  assert.equal(user.ok, true);
  if (user.ok) assert.deepEqual(user.body.target, { type: 'user', userId: 'u-1' });

  const course = buildComposePayload({ ...baseForm(), targetType: 'course', courseId: 'c-1' });
  assert.equal(course.ok, true);
  if (course.ok) assert.deepEqual(course.body.target, { type: 'course', courseId: 'c-1' });
});

test('buildComposePayload: optional linkUrl included only when set', () => {
  const withLink = buildComposePayload({ ...baseForm(), linkUrl: 'https://codebettle.com/notice' });
  assert.equal(withLink.ok, true);
  if (withLink.ok) assert.equal(withLink.body.linkUrl, 'https://codebettle.com/notice');
  const without = buildComposePayload({ ...baseForm(), linkUrl: '   ' });
  assert.equal(without.ok, true);
  if (without.ok) assert.equal('linkUrl' in without.body, false);
});

test('buildComposePayload: rejects blank title/body and missing target ids', () => {
  assert.deepEqual(buildComposePayload({ ...baseForm(), title: '  ' }), {
    ok: false,
    error: 'Title is required',
  });
  assert.deepEqual(buildComposePayload({ ...baseForm(), body: '' }), {
    ok: false,
    error: 'Message is required',
  });
  assert.deepEqual(buildComposePayload({ ...baseForm(), targetType: 'user', userId: '' }), {
    ok: false,
    error: 'Pick a user to send this to',
  });
  assert.deepEqual(buildComposePayload({ ...baseForm(), targetType: 'course', courseId: '' }), {
    ok: false,
    error: 'Pick a course to send this to',
  });
});

// ---------------------------------------------------------------- static wiring

test('PortalLayout mounts the login popup and renders the bell badge component', () => {
  const layout = read('components/layout/PortalLayout.tsx');
  assert.match(layout, /import LoginNotificationPopup from '@\/components\/notifications\/LoginNotificationPopup'/);
  assert.match(layout, /<LoginNotificationPopup\s*\/>/);
  assert.match(layout, /import NotificationBadge from '@\/components\/notifications\/NotificationBadge'/);
  assert.match(layout, /<NotificationBadge\s*\/>/);
  // The bell link itself stays in the layout (portal-switch tests
  // assert the ${portalBase}/notifications link lives there — PR #33:
  // the admin portal's prefix is the secret base path, not /admin);
  // only the badge's fetch lives in NotificationBadge, so the layout
  // keeps just its pre-existing logout fetch.
  assert.match(layout, /\$\{portalBase\}\/notifications/);
  assert.doesNotMatch(layout, /\/api\/notifications/);
  assert.doesNotMatch(layout, /w-2 h-2 bg-primary rounded-full/);
  const badge = read('components/notifications/NotificationBadge.tsx');
  assert.match(badge, /\/api\/notifications\?limit=1/);
  assert.match(badge, /unreadCount > 9 \? '9\+' : unreadCount/);
  assert.match(badge, /unreadCount === null \|\| unreadCount <= 0/);
});

test('LoginNotificationPopup: acknowledge-required hides Close, never traps on fetch failure', () => {
  const popup = read('components/notifications/LoginNotificationPopup.tsx');
  assert.match(popup, /\/api\/notifications\?pending=true/);
  assert.match(popup, /\/api\/notifications\/\$\{current\.id\}\/acknowledge/);
  assert.match(popup, /\/api\/notifications\/\$\{current\.id\}\/read/);
  assert.match(popup, /Please acknowledge to continue/);
  assert.match(popup, /\{!mustAcknowledge && \(/);
  assert.match(popup, /of \{notifications\.length\}/);
  // Failure path renders nothing and only logs.
  assert.match(popup, /console\.error\('\[LoginNotificationPopup\] pending fetch failed/);
});

test('notifications client: filters call the typed query and acknowledge posts', () => {
  const client = read('app/student/notifications/student-notifications-client.tsx');
  assert.match(client, /buildNotificationsQuery\(\{ type, category, page: nextPage \}\)/);
  assert.match(client, /\/api\/notifications\/\$\{id\}\/acknowledge/);
  assert.match(client, /Acknowledged/);
  assert.match(client, /Acknowledge/);
  // Prefs panel: Worker A's new event keys are labelled (their types
  // expose support_request + request_update).
  assert.match(client, /support_request.*Support requests/);
  assert.match(client, /request_update.*Request updates/);
});

test('admin compose page: server-side admin + notifications-area guard', () => {
  const page = read('app/admin/notifications/compose/page.tsx');
  assert.match(page, /hasAdminCapability\(session\)/);
  assert.match(page, /hasAdminArea\(session\.adminPermissions, 'notifications'\)/);
  assert.match(page, /AdminNotificationComposeForm/);
});

test('admin announcements client: course scope posts type course + courseId', () => {
  const client = read('app/admin/announcements/announcements-client.tsx');
  assert.match(client, /type: scope/);
  assert.match(client, /\.\.\.\(scope === 'course' \? \{ courseId \} : \{\}\)/);
  assert.match(client, /\/api\/admin\/courses\?limit=100/);
  // Site-wide flow unchanged: still posts type 'site-wide' by default.
  assert.match(client, /useState<'site-wide' \| 'course'>\('site-wide'\)/);
});
