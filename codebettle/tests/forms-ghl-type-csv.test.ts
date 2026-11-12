import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { __clearRateLimits } from '../lib/rate-limit';
import { createFakeDb, type FakeDb } from './fake-db';
import { formTypeLabel } from '../lib/forms';
import {
  createFormService,
  updateFormService,
} from '../lib/services/form-service';
import { GET as adminExport } from '../app/api/admin/forms/[id]/submissions/export/route';
import { POST as adminCreate } from '../app/api/admin/forms/route';
import { PATCH as adminPatch } from '../app/api/admin/forms/[id]/route';
import {
  PATCH as adminPatchSubmission,
} from '../app/api/admin/forms/[id]/submissions/[submissionId]/route';
import { POST as publicSubmit } from '../app/api/forms/[slug]/submit/route';
import type { FormSchema } from '../lib/db/types';
import type { SessionUser } from '../lib/services/auth-service';

/**
 * Forms Builder GHL upgrade, items 1–3 (Worker A):
 * 1. `type` is now a free-text purpose — any non-empty string up to
 *    50 chars; the registration/survey-only restriction is gone.
 * 2. The form name (and submissions count) in the admin list links
 *    to the submissions page; the row still opens the builder.
 * 3. CSV export honours the reviewed filter (?reviewed=true|false)
 *    and the button labels its scope.
 *
 * Client behaviour (which rows link where, button labels) is
 * asserted by source inspection — there is no jsdom in this repo,
 * following the admin-profile / portal-switch test pattern.
 */

const D = (s: string) => new Date(s);
const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };
const RESTRICTED_ADMIN: SessionUser = {
  id: 'admin-2', name: 'Restricted', email: 'restricted@codebettle.com', role: 'admin',
  adminPermissions: {},
};
const STU1: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };

const SCHEMA: FormSchema = {
  fields: [
    { id: 'name', type: 'text', label: 'Full name', required: true, validation: { minLength: 2, maxLength: 100 } },
    { id: 'email', type: 'email', label: 'Email', required: true },
  ],
};

const VALID_DATA = { name: 'Ali Khan', email: 'ali@example.com' };

let fake: FakeDb;

function jsonReq(url: string, method: string, body?: unknown, ip?: string): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...(ip ? { 'x-forwarded-for': ip } : {}),
    },
  });
}

async function createPublishedForm() {
  const result = await createFormService(ADMIN, {
    name: 'Summer Survey',
    slug: 'summer-survey',
    type: 'survey',
    schema: SCHEMA,
    status: 'published',
  });
  assert.ok(!('error' in result), JSON.stringify(result));
  return result.form;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  __clearRateLimits();
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', isAdmin: true, status: 'active', joinedAt: D('2024-01-01') },
    { id: 'admin-2', name: 'Restricted', email: 'restricted@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', isAdmin: true, adminPermissions: {}, status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
  ]);
  __setTestSession(ADMIN);
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
  __clearRateLimits();
});

// ---------------------------------------------------------------------------
// 1. Any-purpose type (service level)
// ---------------------------------------------------------------------------

test('purpose: any non-empty string up to 50 chars is accepted; legacy registration/survey keep working', async () => {
  for (const type of ['Feedback', 'Job Application', 'quiz', 'Volunteer Sign-up', 'General']) {
    const created = await createFormService(ADMIN, {
      name: `Form ${type}`, type, schema: SCHEMA,
    });
    assert.ok(!('error' in created), `${type}: ${JSON.stringify(created)}`);
    assert.equal(created.form.type, type);
  }

  // Legacy values still create and round-trip as-is.
  const reg = await createFormService(ADMIN, { name: 'Reg', type: 'registration', schema: SCHEMA });
  assert.ok(!('error' in reg));
  assert.equal(reg.form.type, 'registration');
  const survey = await createFormService(ADMIN, { name: 'Sur', type: 'survey', schema: SCHEMA });
  assert.ok(!('error' in survey));
  assert.equal(survey.form.type, 'survey');

  // Exactly 50 chars is the limit; 51 is rejected.
  const fifty = await createFormService(ADMIN, { name: 'Fifty', type: 'x'.repeat(50), schema: SCHEMA });
  assert.ok(!('error' in fifty), JSON.stringify(fifty));
});

test('purpose: empty, whitespace-only and over-50-char purposes are rejected on create and update', async () => {
  for (const bad of ['', '   ', 'x'.repeat(51)]) {
    const created = await createFormService(ADMIN, { name: 'Bad', type: bad, schema: SCHEMA });
    assert.ok('error' in created && created.status === 400, JSON.stringify(created));
  }

  const created = await createFormService(ADMIN, { name: 'Ok', type: 'Feedback', schema: SCHEMA });
  assert.ok(!('error' in created));
  const formId = created.form.id;

  const updated = await updateFormService(ADMIN, formId, { type: 'Job Application' });
  assert.ok(!('error' in updated), JSON.stringify(updated));
  assert.equal(updated.form.type, 'Job Application');

  for (const bad of ['', 'x'.repeat(51)]) {
    const badUpdate = await updateFormService(ADMIN, formId, { type: bad });
    assert.ok('error' in badUpdate && badUpdate.status === 400, JSON.stringify(badUpdate));
  }
});

test('formTypeLabel: raw purpose with first letter title-cased', () => {
  assert.equal(formTypeLabel('registration'), 'Registration');
  assert.equal(formTypeLabel('survey'), 'Survey');
  assert.equal(formTypeLabel('Feedback'), 'Feedback');
  assert.equal(formTypeLabel('job application'), 'Job application');
  assert.equal(formTypeLabel(''), '');
});

// ---------------------------------------------------------------------------
// 1. Any-purpose type (API zod level)
// ---------------------------------------------------------------------------

test('POST /api/admin/forms: free-text purpose accepted, empty/over-long purpose is 400', async () => {
  const ok = await adminCreate(
    jsonReq('http://localhost/api/admin/forms', 'POST', {
      name: 'Feedback Form', type: 'Feedback', schema: SCHEMA,
    }),
  );
  assert.equal(ok.status, 201);
  assert.equal((await ok.json()).form.type, 'Feedback');

  const empty = await adminCreate(
    jsonReq('http://localhost/api/admin/forms', 'POST', {
      name: 'Empty', type: '  ', schema: SCHEMA,
    }),
  );
  assert.equal(empty.status, 400);

  const tooLong = await adminCreate(
    jsonReq('http://localhost/api/admin/forms', 'POST', {
      name: 'Too long', type: 'x'.repeat(51), schema: SCHEMA,
    }),
  );
  assert.equal(tooLong.status, 400);
});

test('PATCH /api/admin/forms/[id]: purpose can change to any free text', async () => {
  const created = await createFormService(ADMIN, { name: 'Patch Me', type: 'survey', schema: SCHEMA });
  assert.ok(!('error' in created));
  const res = await adminPatch(
    jsonReq('http://localhost/api/admin/forms/x', 'PATCH', { type: 'Volunteer Sign-up' }),
    { params: Promise.resolve({ id: created.form.id }) },
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).form.type, 'Volunteer Sign-up');

  const bad = await adminPatch(
    jsonReq('http://localhost/api/admin/forms/x', 'PATCH', { type: '' }),
    { params: Promise.resolve({ id: created.form.id }) },
  );
  assert.equal(bad.status, 400);
});

// ---------------------------------------------------------------------------
// 2. Form name -> submissions (source guards)
// ---------------------------------------------------------------------------

test('forms list: name and submissions count link to submissions; row still opens the builder; no type filter', () => {
  const src = read('app/admin/forms/forms-client.tsx');

  // The name is a button that stops the row click and navigates to
  // the submissions page.
  assert.match(src, /<button[^>]*\n?\s*type="button"[\s\S]*?e\.stopPropagation\(\);\s*router\.push\(`\/admin\/forms\/\$\{form\.id\}\/submissions`\)/);
  assert.ok(src.includes('{form.name}'), 'name button renders the form name');
  // The submissions-count cell is a button to the same page.
  assert.match(src, /submissionCountOf\(form\)/);
  const countLink = src.indexOf('submissionCountOf(form)');
  assert.ok(src.slice(0, countLink).includes('/submissions'), 'count cell links to submissions');

  // The row click still opens the builder, and the pencil still does.
  assert.ok(src.includes('onClick={() => router.push(`/admin/forms/${form.id}/builder`)}'));
  assert.ok(src.includes('title="Open builder"'));
  assert.ok(src.includes('title="View submissions"'));

  // No type filter remains: no typeFilter state, no 'All types'
  // option, and the header/empty-state copy is purpose-free.
  assert.doesNotMatch(src, /typeFilter/);
  assert.doesNotMatch(src, /All types/);
  assert.ok(src.includes('Forms for any purpose'));
  assert.match(src, /Create your first form for any purpose/);

  // Create modal: free-text Purpose input, prefilled 'General',
  // no Type select.
  assert.match(src, /label="Purpose"/);
  assert.match(src, /placeholder="Registration, Feedback, Job Application…"/);
  assert.ok(src.includes("useState('General')"));
  assert.doesNotMatch(src, /label="Type"/);
});

// ---------------------------------------------------------------------------
// 3. CSV export honours the reviewed filter + stays admin-gated
// ---------------------------------------------------------------------------

async function seedTwoSubmissions(formId: string) {
  __setTestSession(null);
  const one = await publicSubmit(
    jsonReq('http://localhost/api/forms/summer-survey/submit', 'POST', { data: VALID_DATA }, '10.0.3.1'),
    { params: Promise.resolve({ slug: 'summer-survey' }) },
  );
  const subId = (await one.json()).submissionId;
  const two = await publicSubmit(
    jsonReq('http://localhost/api/forms/summer-survey/submit', 'POST', {
      data: { name: 'Sara', email: 'sara@example.com' },
    }, '10.0.3.2'),
    { params: Promise.resolve({ slug: 'summer-survey' }) },
  );
  const subId2 = (await two.json()).submissionId;
  __setTestSession(ADMIN);
  const marked = await adminPatchSubmission(
    jsonReq('http://localhost/api/admin/forms/x/submissions/y', 'PATCH', { reviewed: true }),
    { params: Promise.resolve({ id: formId, submissionId: subId }) },
  );
  assert.equal(marked.status, 200);
  return { reviewedId: subId, unreviewedId: subId2 };
}

test('CSV export: ?reviewed=true/false limits rows; no param exports all; count header matches', async () => {
  const form = await createPublishedForm();
  await seedTwoSubmissions(form.id);
  const params = { params: Promise.resolve({ id: form.id }) };

  const reviewed = await adminExport(
    jsonReq('http://localhost/api/admin/forms/x/submissions/export?reviewed=true', 'GET'), params,
  );
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.headers.get('X-Export-Count'), '1');
  const reviewedText = await reviewed.text();
  assert.ok(reviewedText.includes('Ali Khan'), 'reviewed export has the reviewed row');
  assert.ok(!reviewedText.includes('Sara'), 'reviewed export excludes the unreviewed row');

  const unreviewed = await adminExport(
    jsonReq('http://localhost/api/admin/forms/x/submissions/export?reviewed=false', 'GET'), params,
  );
  assert.equal(unreviewed.status, 200);
  assert.equal(unreviewed.headers.get('X-Export-Count'), '1');
  const unreviewedText = await unreviewed.text();
  assert.ok(unreviewedText.includes('Sara'), 'unreviewed export has the unreviewed row');
  assert.ok(!unreviewedText.includes('Ali Khan'), 'unreviewed export excludes the reviewed row');

  const all = await adminExport(
    jsonReq('http://localhost/api/admin/forms/x/submissions/export', 'GET'), params,
  );
  assert.equal(all.status, 200);
  assert.equal(all.headers.get('X-Export-Count'), '2');
  const allText = await all.text();
  assert.ok(allText.includes('Ali Khan') && allText.includes('Sara'));

  const bad = await adminExport(
    jsonReq('http://localhost/api/admin/forms/x/submissions/export?reviewed=maybe', 'GET'), params,
  );
  assert.equal(bad.status, 400);
});

test('CSV export: still admin-gated (401 signed out, 403 student, 403 restricted admin)', async () => {
  const form = await createPublishedForm();
  const params = { params: Promise.resolve({ id: form.id }) };
  const url = 'http://localhost/api/admin/forms/x/submissions/export';

  __setTestSession(null);
  assert.equal((await adminExport(jsonReq(url, 'GET'), params)).status, 401);

  __setTestSession(STU1);
  assert.equal((await adminExport(jsonReq(url, 'GET'), params)).status, 403);

  __setTestSession(RESTRICTED_ADMIN);
  assert.equal((await adminExport(jsonReq(url, 'GET'), params)).status, 403);

  __setTestSession(ADMIN);
  assert.equal((await adminExport(jsonReq(url, 'GET'), params)).status, 200);
});

test('submissions page: export passes the current filter and labels its scope', () => {
  const src = read('app/admin/forms/[id]/submissions/submissions-client.tsx');

  // The export fetch carries ?reviewed=true for the reviewed filter
  // and ?reviewed=false for unreviewed; '' (all) sends no param.
  assert.ok(src.includes("params.set('reviewed', 'true')"));
  assert.ok(src.includes("params.set('reviewed', 'false')"));
  assert.match(src, /\/submissions\/export\$\{query \? `\?\$\{query\}` : ''\}/);

  // Button labels its scope.
  assert.ok(src.includes('Export CSV (all)'));
  assert.ok(src.includes('Export CSV (reviewed only)'));
  assert.ok(src.includes('Export CSV (unreviewed only)'));

  // Success toast reports the exported row count.
  assert.match(src, /Exported \$\{count\} submission/);
  assert.ok(src.includes("res.headers.get('X-Export-Count')"));
});
