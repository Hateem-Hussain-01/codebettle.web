// Phase 5, Module 23 — audit log UI helpers (Worker C, UI).
//
// Pure-function tests for the audit log table (query building,
// pagination), the audit nav-visibility predicate, the grant-candidate
// filter, and static wiring checks for the audit page / layout /
// client. The components call Worker B's APIs (GET /api/admin/audit,
// GET/POST /api/admin/audit/access, DELETE /api/admin/audit/access/
// [userId]) and Worker A's lib/super-admin + SessionUser.canViewAuditLog,
// which have since landed in this tree — these tests cover the
// client-side logic plus static checks that the pages import the right
// gates and carry no visible role label. One contract note the UI had
// to adapt to: the audit API filters `actor` by user id, not by
// name/email text, so the actor filter is a select of known actors
// (see mergeActorOptions), not a text search.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  AUDIT_PAGE_SIZE,
  auditGrantCandidates,
  auditPageNumbers,
  auditTotalPages,
  buildAuditQuery,
  canSeeAuditLog,
  clampAuditPage,
  endOfDayIso,
  formatAuditTimestamp,
  mergeActorOptions,
  type AuditFilters,
} from '../components/audit/audit-helpers';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const baseFilters = (): AuditFilters => ({
  actor: '',
  action: '',
  entity: '',
  from: '',
  to: '',
});

// ---------------------------------------------------------------- query building

test('buildAuditQuery: empty filters send only page + pageSize', () => {
  assert.equal(buildAuditQuery(baseFilters(), 1), 'page=1&pageSize=50');
  assert.equal(AUDIT_PAGE_SIZE, 50);
});

test('buildAuditQuery: non-empty filters are sent, empty ones omitted', () => {
  const q = buildAuditQuery(
    { actor: 'user-123', action: 'user.update', entity: '', from: '2026-11-01', to: '2026-11-12' },
    3,
  );
  const params = new URLSearchParams(q);
  assert.equal(params.get('actor'), 'user-123');
  assert.equal(params.get('action'), 'user.update');
  assert.equal(params.get('entity'), null);
  assert.equal(params.get('from'), '2026-11-01');
  // `to` is a calendar date meaning the END of that day (the API
  // compares createdAt <= to as a timestamp).
  assert.equal(params.get('to'), '2026-11-12T23:59:59.999Z');
  assert.equal(params.get('page'), '3');
  assert.equal(params.get('pageSize'), '50');
});

test('buildAuditQuery: page clamps to 1, custom pageSize honoured', () => {
  assert.equal(new URLSearchParams(buildAuditQuery(baseFilters(), 0)).get('page'), '1');
  assert.equal(new URLSearchParams(buildAuditQuery(baseFilters(), -4)).get('page'), '1');
  assert.equal(new URLSearchParams(buildAuditQuery(baseFilters(), 2, 25)).get('pageSize'), '25');
});

test('endOfDayIso: bare dates become end-of-day UTC, other values pass through', () => {
  assert.equal(endOfDayIso('2026-11-12'), '2026-11-12T23:59:59.999Z');
  assert.equal(endOfDayIso('2026-11-12T10:00:00.000Z'), '2026-11-12T10:00:00.000Z');
  assert.equal(endOfDayIso(''), '');
});

test('mergeActorOptions: dedupes by id, keeps the fuller record, sorts by name', () => {
  const merged = mergeActorOptions(
    [{ id: 'u2', name: 'Babar', email: 'b@example.com' }],
    [
      { id: 'u1', name: 'Ayesha', email: 'a@example.com' },
      { id: 'u2', name: '', email: '' },
      { id: 'u3', name: '', email: 'c@example.com' },
    ],
  );
  assert.deepEqual(
    merged.map((o) => o.id),
    ['u1', 'u2', 'u3'],
  );
  assert.equal(merged[1].name, 'Babar');
  assert.equal(merged[2].name, 'Unknown actor');
  assert.deepEqual(mergeActorOptions([], []), []);
});

// ---------------------------------------------------------------- pagination

test('auditTotalPages: 0 -> 1 page, exact multiples, remainder rounds up', () => {
  assert.equal(auditTotalPages(0), 1);
  assert.equal(auditTotalPages(50), 1);
  assert.equal(auditTotalPages(51), 2);
  assert.equal(auditTotalPages(250, 50), 5);
  assert.equal(auditTotalPages(251, 50), 6);
});

test('clampAuditPage: below 1 -> 1, above total -> total', () => {
  assert.equal(clampAuditPage(0, 5), 1);
  assert.equal(clampAuditPage(-2, 5), 1);
  assert.equal(clampAuditPage(3, 5), 3);
  assert.equal(clampAuditPage(9, 5), 5);
  assert.equal(clampAuditPage(1, 1), 1);
});

test('auditPageNumbers: 7 or fewer pages list them all', () => {
  assert.deepEqual(auditPageNumbers(1, 1), [1]);
  assert.deepEqual(auditPageNumbers(4, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test('auditPageNumbers: long runs window around the current page with gaps', () => {
  assert.deepEqual(auditPageNumbers(1, 20), [1, 2, '…', 20]);
  assert.deepEqual(auditPageNumbers(10, 20), [1, '…', 9, 10, 11, '…', 20]);
  assert.deepEqual(auditPageNumbers(20, 20), [1, '…', 19, 20]);
  assert.deepEqual(auditPageNumbers(2, 20), [1, 2, 3, '…', 20]);
});

// ---------------------------------------------------------------- nav visibility

test('canSeeAuditLog: authorized admins and granted viewers see it, others do not', () => {
  assert.equal(canSeeAuditLog({ isAuthorizedAdmin: true }), true);
  assert.equal(canSeeAuditLog({ isAuthorizedAdmin: true, canViewAuditLog: false }), true);
  assert.equal(canSeeAuditLog({ isAuthorizedAdmin: false, canViewAuditLog: true }), true);
  assert.equal(canSeeAuditLog({ isAuthorizedAdmin: false, canViewAuditLog: false }), false);
  assert.equal(canSeeAuditLog({ isAuthorizedAdmin: false }), false);
});

// ---------------------------------------------------------------- grant candidates

const users = [
  { id: 'u1', role: 'admin' as const, isAdmin: true },
  { id: 'u2', role: 'instructor' as const, isAdmin: false, isTeacher: true },
  { id: 'u3', role: 'student' as const, isAdmin: false },
  { id: 'u4', role: 'admin' as const, isAdmin: true },
];

test('auditGrantCandidates: only admin-capability users without access already', () => {
  assert.deepEqual(auditGrantCandidates(users, []).map((u) => u.id), ['u1', 'u4']);
  assert.deepEqual(auditGrantCandidates(users, ['u1']).map((u) => u.id), ['u4']);
  assert.deepEqual(auditGrantCandidates(users, new Set(['u1', 'u4'])), []);
  assert.deepEqual(auditGrantCandidates([], []), []);
});

// ---------------------------------------------------------------- formatting + lists

test('formatAuditTimestamp: renders a readable date+time, passes garbage through', () => {
  const out = formatAuditTimestamp('2026-11-12T09:30:00.000Z');
  assert.match(out, /2026/);
  assert.match(out, /Nov/);
  assert.equal(formatAuditTimestamp('not-a-date'), 'not-a-date');
});

test('AUDIT_ACTIONS / AUDIT_ENTITIES: known actions and entities are offered as filters', () => {
  assert.ok(AUDIT_ACTIONS.includes('admin.user.update'));
  assert.ok(AUDIT_ACTIONS.includes('certificate.issue'));
  assert.ok(AUDIT_ACTIONS.includes('payment.approve'));
  assert.ok(AUDIT_ENTITIES.includes('user'));
  assert.ok(AUDIT_ENTITIES.includes('certificate'));
  assert.ok(AUDIT_ENTITIES.includes('course'));
});

// ---------------------------------------------------------------- static wiring

test('audit page: server re-checks access via isSuperAdmin + canViewAuditLog, redirects otherwise', () => {
  const page = read('app/admin/audit/page.tsx');
  assert.match(page, /isSuperAdmin/);
  assert.match(page, /canViewAuditLog/);
  assert.match(page, /hasAdminCapability/);
  assert.match(page, /redirect\(firstGrantedArea/);
  assert.match(page, /canManageAccess=\{authorized\}/);
});

test('admin layout: Audit Log nav after Reports, gated on authorized admin or canViewAuditLog', () => {
  const layout = read('app/admin/layout.tsx');
  assert.match(layout, /Audit Log/);
  assert.match(layout, /\/admin\/audit/);
  assert.match(layout, /ScrollText/);
  assert.match(layout, /canSeeAuditLog/);
  assert.match(layout, /isSuperAdmin\(session\)/);
  // The audit guard sits beside the access guard.
  assert.match(layout, /pathname === '\/admin\/audit'/);
  // /admin/access is no longer merely full-admin.
  assert.doesNotMatch(layout, /isFullAdmin/);
});

test('access page: re-checks authorized-admin status server-side', () => {
  const page = read('app/admin/access/page.tsx');
  assert.match(page, /isSuperAdmin\(session\)/);
  assert.match(page, /redirect\(firstGrantedArea/);
});

test('audit client: fetches the audit API, renders Access & Permissions, no visible role label', () => {
  const client = read('app/admin/audit/audit-client.tsx');
  assert.match(client, /\/api\/admin\/audit\?/);
  assert.match(client, /\/api\/admin\/audit\/access/);
  assert.match(client, /Access &amp; Permissions/);
  assert.match(client, /Always authorized/);
  assert.match(client, /canManageAccess/);
  assert.match(client, /window\.confirm\(/);
  // The actor filter is a select of known actors (the API filters
  // `actor` by user id, not by name/email text).
  assert.match(client, /actorOptions/);
  assert.match(client, /All actors/);
  // The authorized-administrator concept is access control only: the
  // label must never appear in any user-facing string in this file.
  // (Built from parts so this test itself does not contain the label.)
  const forbidden = ['Super', 'Admin'].join(' ');
  const forbiddenLower = ['super', 'admin'].join(' ');
  assert.equal(client.includes(forbidden), false);
  assert.equal(client.toLowerCase().includes(forbiddenLower), false);
  assert.equal(client.includes('super-admin'), false);
});

test('audit client: no fabricated rows — empty state, never placeholder data', () => {
  const client = read('app/admin/audit/audit-client.tsx');
  assert.match(client, /No audit entries/);
  assert.doesNotMatch(client, /lorem|John Doe|Jane Doe|sample entry/i);
});
