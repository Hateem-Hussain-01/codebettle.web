import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { __clearRateLimits } from '../lib/rate-limit';
import { createFakeDb, type FakeDb } from './fake-db';
import { validateFormSchema, validateSubmissionAgainstSchema } from '../lib/services/form-schema';
import {
  createFormService,
  deleteFormService,
  slugifyFormName,
  updateFormService,
} from '../lib/services/form-service';
import { toFormSchema } from '../lib/db/mappers';
import { onFormSubmissionCreated } from '../lib/services/notification-service';
import { getFormDefinitionById, getFormSubmissionById } from '../lib/db/forms';
import { listNotificationsForUser } from '../lib/db/notifications';
import { GET as adminList, POST as adminCreate } from '../app/api/admin/forms/route';
import {
  DELETE as adminDelete,
  GET as adminGet,
  PATCH as adminPatch,
} from '../app/api/admin/forms/[id]/route';
import { GET as adminListSubmissions } from '../app/api/admin/forms/[id]/submissions/route';
import {
  GET as adminGetSubmission,
  PATCH as adminPatchSubmission,
} from '../app/api/admin/forms/[id]/submissions/[submissionId]/route';
import { GET as adminExport } from '../app/api/admin/forms/[id]/submissions/export/route';
import { GET as publicGet } from '../app/api/forms/[slug]/route';
import { POST as publicSubmit } from '../app/api/forms/[slug]/submit/route';
import type { FormSchema } from '../lib/db/types';
import type { SessionUser } from '../lib/services/auth-service';

/**
 * Phase 6 — Forms Builder (Worker A: data layer + APIs).
 * Covers schema validation, submission validation (including
 * tampered/extra fields), slug uniqueness, the admin-area guard,
 * the public 404 for draft forms, the rate-limited public submit,
 * admin CRUD + review + CSV export, and the notification hook.
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
    { id: 'age', type: 'number', label: 'Age', required: false, validation: { min: 13, max: 120 } },
    { id: 'course', type: 'select', label: 'Course', required: true, options: ['Web', 'Data'] },
    { id: 'newsletter', type: 'checkbox', label: 'Newsletter', required: false, options: ['Weekly digest', 'Product news'] },
    { id: 'dob', type: 'date', label: 'Date of birth', required: false },
  ],
};

const VALID_DATA = {
  name: 'Ali Khan',
  email: 'ali@example.com',
  age: 22,
  course: 'Web',
  newsletter: ['Weekly digest'],
  dob: '2004-05-01',
};

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

async function createPublishedForm(slug?: string) {
  const result = await createFormService(ADMIN, {
    name: 'Summer Survey',
    ...(slug ? { slug } : {}),
    type: 'survey',
    description: 'Tell us about your summer.',
    schema: SCHEMA,
    status: 'published',
  });
  assert.ok(!('error' in result), JSON.stringify(result));
  return result.form;
}

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
// Schema validation (pure)
// ---------------------------------------------------------------------------

test('validateFormSchema: valid schema passes; duplicate ids, bad types and option-less selects fail', () => {
  assert.deepEqual(validateFormSchema(SCHEMA), { ok: true });
  assert.deepEqual(validateFormSchema({ fields: [] }), {
    ok: false,
    errors: ['A form must have at least one field'],
  });
  const dup = validateFormSchema({
    fields: [
      { id: 'a', type: 'text', label: 'A', required: true },
      { id: 'a', type: 'text', label: 'A again', required: false },
    ],
  });
  assert.equal(dup.ok, false);
  assert.ok(dup.ok === false && dup.errors.some((e) => e.includes('duplicate field id "a"')));

  const badType = validateFormSchema({
    fields: [{ id: 'a', type: 'file', label: 'Upload', required: false }],
  });
  assert.equal(badType.ok, false, 'there is no file-upload field type in v1');

  const noOptions = validateFormSchema({
    fields: [{ id: 'a', type: 'select', label: 'Pick', required: true, options: [] }],
  });
  assert.equal(noOptions.ok, false);

  const badPattern = validateFormSchema({
    fields: [{ id: 'a', type: 'text', label: 'A', required: false, validation: { pattern: '([' } }],
  });
  assert.equal(badPattern.ok, false);
});

test('validateSubmissionAgainstSchema: valid data passes; required, email, range, options and dates are checked', () => {
  assert.deepEqual(validateSubmissionAgainstSchema(SCHEMA, VALID_DATA), { ok: true });
  // Optional fields may be omitted entirely.
  assert.deepEqual(
    validateSubmissionAgainstSchema(SCHEMA, { name: 'Ali', email: 'a@b.co', course: 'Data' }),
    { ok: true },
  );

  const missing = validateSubmissionAgainstSchema(SCHEMA, { email: 'a@b.co', course: 'Web' });
  assert.equal(missing.ok, false);
  assert.ok(missing.ok === false && missing.fieldErrors.name === 'Full name is required');

  const badEmail = validateSubmissionAgainstSchema(SCHEMA, { ...VALID_DATA, email: 'not-an-email' });
  assert.ok(badEmail.ok === false && badEmail.fieldErrors.email?.includes('valid email'));

  const tooYoung = validateSubmissionAgainstSchema(SCHEMA, { ...VALID_DATA, age: 10 });
  assert.ok(tooYoung.ok === false && tooYoung.fieldErrors.age?.includes('at least 13'));

  const badOption = validateSubmissionAgainstSchema(SCHEMA, { ...VALID_DATA, course: 'Cooking' });
  assert.ok(badOption.ok === false && badOption.fieldErrors.course?.includes('available options'));

  const badDate = validateSubmissionAgainstSchema(SCHEMA, { ...VALID_DATA, dob: 'yesterday' });
  assert.ok(badDate.ok === false && badDate.fieldErrors.dob?.includes('valid date'));

  const shortName = validateSubmissionAgainstSchema(SCHEMA, { ...VALID_DATA, name: 'A' });
  assert.ok(shortName.ok === false && shortName.fieldErrors.name?.includes('at least 2 characters'));

  const badCheckbox = validateSubmissionAgainstSchema(SCHEMA, { ...VALID_DATA, newsletter: 'yes' });
  assert.ok(badCheckbox.ok === false && badCheckbox.fieldErrors.newsletter);
});

test('validateSubmissionAgainstSchema: tampered/extra fields are rejected', () => {
  const extra = validateSubmissionAgainstSchema(SCHEMA, { ...VALID_DATA, isAdmin: true, score: 100 });
  assert.equal(extra.ok, false);
  assert.ok(extra.ok === false && extra.fieldErrors.isAdmin === 'Unknown field');
  assert.ok(extra.ok === false && extra.fieldErrors.score === 'Unknown field');

  const notObject = validateSubmissionAgainstSchema(SCHEMA, [VALID_DATA]);
  assert.equal(notObject.ok, false);
});

// ---------------------------------------------------------------------------
// Slug generation + uniqueness (service)
// ---------------------------------------------------------------------------

test('slugifyFormName + create: same name twice yields unique slugs', async () => {
  assert.equal(slugifyFormName('Summer Survey 2026!'), 'summer-survey-2026');
  const first = await createFormService(ADMIN, { name: 'Summer Survey', type: 'survey', schema: SCHEMA });
  assert.ok(!('error' in first), JSON.stringify(first));
  assert.equal(first.form.slug, 'summer-survey');
  const second = await createFormService(ADMIN, { name: 'Summer Survey', type: 'survey', schema: SCHEMA });
  assert.ok(!('error' in second), JSON.stringify(second));
  assert.equal(second.form.slug, 'summer-survey-2');
});

test('createFormService: any-purpose type is accepted, empty/over-long purpose rejected; invalid schema rejected; explicit duplicate slug is 409', async () => {
  // 'quiz' used to be rejected under the registration/survey-only
  // rule; type is now free-text purpose, so it must be accepted.
  const quiz = await createFormService(ADMIN, {
    name: 'Quiz?', type: 'quiz', schema: SCHEMA,
  });
  assert.ok(!('error' in quiz), JSON.stringify(quiz));
  assert.equal(quiz.form.type, 'quiz');

  const empty = await createFormService(ADMIN, {
    name: 'Empty?', type: '   ', schema: SCHEMA,
  });
  assert.ok('error' in empty && empty.status === 400);

  const tooLong = await createFormService(ADMIN, {
    name: 'Too long?', type: 'x'.repeat(51), schema: SCHEMA,
  });
  assert.ok('error' in tooLong && tooLong.status === 400);

  const badSchema = await createFormService(ADMIN, {
    name: 'Bad', type: 'survey', schema: { fields: [{ id: 'x', type: 'select', label: 'X', required: true }] },
  });
  assert.ok('error' in badSchema && badSchema.status === 400);

  const one = await createFormService(ADMIN, { name: 'A', slug: 'my-form', type: 'registration', schema: SCHEMA });
  assert.ok(!('error' in one));
  const two = await createFormService(ADMIN, { name: 'B', slug: 'my-form', type: 'registration', schema: SCHEMA });
  assert.ok('error' in two && two.status === 409);
});

// ---------------------------------------------------------------------------
// Admin-area guard
// ---------------------------------------------------------------------------

test('GET /api/admin/forms: 401 signed out, 403 student, 403 restricted admin without forms area, 200 full admin', async () => {
  __setTestSession(null);
  assert.equal((await adminList(jsonReq('http://localhost/api/admin/forms', 'GET'))).status, 401);

  __setTestSession(STU1);
  assert.equal((await adminList(jsonReq('http://localhost/api/admin/forms', 'GET'))).status, 403);

  __setTestSession(RESTRICTED_ADMIN);
  assert.equal((await adminList(jsonReq('http://localhost/api/admin/forms', 'GET'))).status, 403);

  __setTestSession(ADMIN);
  const res = await adminList(jsonReq('http://localhost/api/admin/forms', 'GET'));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).forms, []);
});

// ---------------------------------------------------------------------------
// Admin CRUD
// ---------------------------------------------------------------------------

test('admin create/get/patch/delete round-trip; rename keeps the slug', async () => {
  const created = await adminCreate(
    jsonReq('http://localhost/api/admin/forms', 'POST', {
      name: 'Join Us', type: 'registration', schema: SCHEMA,
    }),
  );
  assert.equal(created.status, 201);
  const form = (await created.json()).form;
  assert.equal(form.slug, 'join-us');
  assert.equal(form.status, 'draft');

  const got = await adminGet(jsonReq('http://localhost/api/admin/forms/x', 'GET'), {
    params: Promise.resolve({ id: form.id }),
  });
  assert.equal(got.status, 200);
  assert.equal((await got.json()).form.name, 'Join Us');

  const patched = await adminPatch(
    jsonReq('http://localhost/api/admin/forms/x', 'PATCH', { name: 'Join Us 2026', status: 'published' }),
    { params: Promise.resolve({ id: form.id }) },
  );
  assert.equal(patched.status, 200);
  const updated = (await patched.json()).form;
  assert.equal(updated.name, 'Join Us 2026');
  assert.equal(updated.slug, 'join-us', 'rename must not move a published URL');
  assert.equal(updated.status, 'published');

  const deleted = await adminDelete(jsonReq('http://localhost/api/admin/forms/x', 'DELETE'), {
    params: Promise.resolve({ id: form.id }),
  });
  assert.equal(deleted.status, 200);
  assert.equal((await adminGet(jsonReq('http://localhost/api/admin/forms/x', 'GET'), {
    params: Promise.resolve({ id: form.id }),
  })).status, 404);
});

test('admin create with an invalid schema body is 400', async () => {
  const res = await adminCreate(
    jsonReq('http://localhost/api/admin/forms', 'POST', {
      name: 'Bad', type: 'survey', schema: { fields: 'nope' },
    }),
  );
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// Public read: published only
// ---------------------------------------------------------------------------

test('GET /api/forms/[slug]: draft forms 404; published forms return only public fields', async () => {
  const draft = await createFormService(ADMIN, { name: 'Draft Form', type: 'survey', schema: SCHEMA });
  assert.ok(!('error' in draft));
  assert.equal(
    (await publicGet(jsonReq('http://localhost/api/forms/draft-form', 'GET'), {
      params: Promise.resolve({ slug: 'draft-form' }),
    })).status,
    404,
  );

  const published = await createPublishedForm('summer-survey');
  const res = await publicGet(jsonReq('http://localhost/api/forms/summer-survey', 'GET'), {
    params: Promise.resolve({ slug: 'summer-survey' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(Object.keys(body.form).sort(), ['description', 'id', 'name', 'schema', 'type']);
  assert.equal(body.form.name, 'Summer Survey');
  assert.ok(!('createdById' in body.form) && !('status' in body.form));
  assert.equal(published.slug, 'summer-survey');

  assert.equal(
    (await publicGet(jsonReq('http://localhost/api/forms/nope', 'GET'), {
      params: Promise.resolve({ slug: 'nope' }),
    })).status,
    404,
  );
});

// ---------------------------------------------------------------------------
// Public submit: validation, session attribution, rate limit
// ---------------------------------------------------------------------------

test('POST /api/forms/[slug]/submit: anonymous 201 stores the submission; signed-in records submitterId', async () => {
  await createPublishedForm('summer-survey');

  __setTestSession(null);
  const anon = await publicSubmit(
    jsonReq('http://localhost/api/forms/summer-survey/submit', 'POST', { data: VALID_DATA }, '10.0.0.1'),
    { params: Promise.resolve({ slug: 'summer-survey' }) },
  );
  assert.equal(anon.status, 201);
  const anonBody = await anon.json();
  assert.equal(anonBody.ok, true);
  const anonRow = await getFormSubmissionById(anonBody.submissionId);
  assert.ok(anonRow && anonRow.submitterId === undefined);
  assert.deepEqual(anonRow.data, { ...VALID_DATA });

  __setTestSession(STU1);
  const signed = await publicSubmit(
    jsonReq('http://localhost/api/forms/summer-survey/submit', 'POST', { data: VALID_DATA }, '10.0.0.2'),
    { params: Promise.resolve({ slug: 'summer-survey' }) },
  );
  assert.equal(signed.status, 201);
  const signedRow = await getFormSubmissionById((await signed.json()).submissionId);
  assert.ok(signedRow && signedRow.submitterId === 'stu-1');
});

test('POST /api/forms/[slug]/submit: invalid data is 400 with fieldErrors; draft forms 404', async () => {
  await createPublishedForm('summer-survey');
  __setTestSession(null);

  const bad = await publicSubmit(
    jsonReq('http://localhost/api/forms/summer-survey/submit', 'POST', {
      data: { ...VALID_DATA, email: 'bad', injected: true },
    }, '10.0.0.3'),
    { params: Promise.resolve({ slug: 'summer-survey' }) },
  );
  assert.equal(bad.status, 400);
  const badBody = await bad.json();
  assert.ok(badBody.fieldErrors.email);
  assert.equal(badBody.fieldErrors.injected, 'Unknown field');

  const draft = await createFormService(ADMIN, { name: 'Draft Only', type: 'survey', schema: SCHEMA });
  assert.ok(!('error' in draft));
  const draftRes = await publicSubmit(
    jsonReq('http://localhost/api/forms/draft-only/submit', 'POST', { data: VALID_DATA }, '10.0.0.4'),
    { params: Promise.resolve({ slug: 'draft-only' }) },
  );
  assert.equal(draftRes.status, 404);
});

test('POST /api/forms/[slug]/submit: 6th rapid submission from one IP is 429', async () => {
  await createPublishedForm('summer-survey');
  __setTestSession(null);
  for (let i = 0; i < 5; i++) {
    const res = await publicSubmit(
      jsonReq('http://localhost/api/forms/summer-survey/submit', 'POST', { data: VALID_DATA }, '10.0.0.9'),
      { params: Promise.resolve({ slug: 'summer-survey' }) },
    );
    assert.equal(res.status, 201, `submission ${i + 1} should pass`);
  }
  const blocked = await publicSubmit(
    jsonReq('http://localhost/api/forms/summer-survey/submit', 'POST', { data: VALID_DATA }, '10.0.0.9'),
    { params: Promise.resolve({ slug: 'summer-survey' }) },
  );
  assert.equal(blocked.status, 429);
  // A different IP is unaffected.
  const other = await publicSubmit(
    jsonReq('http://localhost/api/forms/summer-survey/submit', 'POST', { data: VALID_DATA }, '10.0.0.10'),
    { params: Promise.resolve({ slug: 'summer-survey' }) },
  );
  assert.equal(other.status, 201);
});

// ---------------------------------------------------------------------------
// Admin submissions: list/filter/review/export
// ---------------------------------------------------------------------------

test('admin submissions: list, reviewed filter, mark reviewed, single get, CSV export', async () => {
  const form = await createPublishedForm('summer-survey');
  __setTestSession(null);
  const one = await publicSubmit(
    jsonReq('http://localhost/api/forms/summer-survey/submit', 'POST', { data: VALID_DATA }, '10.0.1.1'),
    { params: Promise.resolve({ slug: 'summer-survey' }) },
  );
  const subId = (await one.json()).submissionId;
  const two = await publicSubmit(
    jsonReq('http://localhost/api/forms/summer-survey/submit', 'POST', {
      data: { ...VALID_DATA, name: 'Sara', email: 'sara@example.com' },
    }, '10.0.1.2'),
    { params: Promise.resolve({ slug: 'summer-survey' }) },
  );
  const subId2 = (await two.json()).submissionId;

  __setTestSession(ADMIN);
  const params = { params: Promise.resolve({ id: form.id }) };
  const list = await adminListSubmissions(
    jsonReq('http://localhost/api/admin/forms/x/submissions', 'GET'), params,
  );
  assert.equal(list.status, 200);
  const listBody = await list.json();
  assert.equal(listBody.total, 2);
  assert.equal(listBody.submissions.length, 2);

  const unreviewed = await adminListSubmissions(
    jsonReq('http://localhost/api/admin/forms/x/submissions?status=unreviewed', 'GET'), params,
  );
  assert.equal((await unreviewed.json()).total, 2);

  const marked = await adminPatchSubmission(
    jsonReq('http://localhost/api/admin/forms/x/submissions/y', 'PATCH', { reviewed: true }),
    { params: Promise.resolve({ id: form.id, submissionId: subId }) },
  );
  assert.equal(marked.status, 200);
  assert.equal((await marked.json()).submission.reviewed, true);

  const reviewed = await adminListSubmissions(
    jsonReq('http://localhost/api/admin/forms/x/submissions?status=reviewed', 'GET'), params,
  );
  const reviewedBody = await reviewed.json();
  assert.equal(reviewedBody.total, 1);
  assert.equal(reviewedBody.submissions[0].id, subId);

  const single = await adminGetSubmission(
    jsonReq('http://localhost/api/admin/forms/x/submissions/y', 'GET'),
    { params: Promise.resolve({ id: form.id, submissionId: subId2 }) },
  );
  assert.equal(single.status, 200);
  assert.equal((await single.json()).submission.data.name, 'Sara');

  const csv = await adminExport(
    jsonReq('http://localhost/api/admin/forms/x/submissions/export', 'GET'), params,
  );
  assert.equal(csv.status, 200);
  assert.ok((csv.headers.get('Content-Disposition') ?? '').includes('form-summer-survey-submissions.csv'));
  const text = await csv.text();
  assert.ok(text.startsWith('Submission ID,Submitted At,Reviewed,Submitter ID,Full name,Email,Age,Course,Newsletter,Date of birth'));
  assert.ok(text.includes('Ali Khan') && text.includes('Sara'));
  assert.ok(text.includes('yes') && text.includes('no'));
});

// ---------------------------------------------------------------------------
// Delete cascades + notification hook
// ---------------------------------------------------------------------------

test('deleteFormService removes the form and its submissions', async () => {
  const form = await createPublishedForm('summer-survey');
  __setTestSession(null);
  const res = await publicSubmit(
    jsonReq('http://localhost/api/forms/summer-survey/submit', 'POST', { data: VALID_DATA }, '10.0.2.1'),
    { params: Promise.resolve({ slug: 'summer-survey' }) },
  );
  const subId = (await res.json()).submissionId;
  assert.ok(await getFormSubmissionById(subId));
  __setTestSession(ADMIN);
  const deleted = await deleteFormService(ADMIN, form.id);
  assert.deepEqual(deleted, { deleted: true });
  assert.equal(await getFormDefinitionById(form.id), null);
  assert.equal(await getFormSubmissionById(subId), null);
});

test('onFormSubmissionCreated notifies admins (form_submission event)', async () => {
  const form = await createPublishedForm('summer-survey');
  const submission = {
    id: 'sub-1', formId: form.id, data: VALID_DATA, reviewed: false,
    submittedAt: new Date().toISOString(),
  };
  const summary = await onFormSubmissionCreated(form, submission);
  // Both seeded admins have the admin capability, so both are notified.
  assert.equal(summary.sent, 2);
  const notes = await listNotificationsForUser('admin-1');
  assert.equal(notes.total, 1);
  assert.equal(notes.items[0].type, 'form_submission');
  assert.ok(notes.items[0].title.includes('Summer Survey'));
});

// ---------------------------------------------------------------------------
// Reconciliation (coordinator): draft vs publish field rule, checkbox
// without options, required unchecked checkbox, schema settings keys
// ---------------------------------------------------------------------------

test('reconciliation: draft create with empty schema succeeds; create as published with empty schema fails', async () => {
  const draft = await createFormService(ADMIN, {
    name: 'Empty Draft', type: 'survey', schema: { fields: [] },
  });
  assert.ok(!('error' in draft), JSON.stringify(draft));
  assert.equal(draft.form.status, 'draft');

  const published = await createFormService(ADMIN, {
    name: 'Empty Published', type: 'survey', schema: { fields: [] }, status: 'published',
  });
  assert.ok('error' in published && published.status === 400);
});

test('reconciliation: publishing an empty-schema draft fails; saving draft schema with no fields succeeds', async () => {
  const draft = await createFormService(ADMIN, {
    name: 'Empty Draft', type: 'survey', schema: { fields: [] },
  });
  assert.ok(!('error' in draft), JSON.stringify(draft));

  const publish = await updateFormService(ADMIN, draft.form.id, { status: 'published' });
  assert.ok('error' in publish && publish.status === 400);

  const saveEmpty = await updateFormService(ADMIN, draft.form.id, { schema: { fields: [] } });
  assert.ok(!('error' in saveEmpty), JSON.stringify(saveEmpty));

  const publishWithFields = await updateFormService(ADMIN, draft.form.id, {
    schema: SCHEMA, status: 'published',
  });
  assert.ok(!('error' in publishWithFields), JSON.stringify(publishWithFields));
  assert.equal(publishWithFields.form.status, 'published');
});

test('reconciliation: checkbox without options is a valid single boolean; required unchecked fails submission', () => {
  const agreeSchema: FormSchema = {
    fields: [{ id: 'agree', type: 'checkbox', label: 'I agree', required: true }],
  };
  assert.deepEqual(validateFormSchema(agreeSchema), { ok: true });

  assert.deepEqual(
    validateSubmissionAgainstSchema(agreeSchema, { agree: false }),
    { ok: false, fieldErrors: { agree: 'I agree is required' } },
  );
  assert.deepEqual(validateSubmissionAgainstSchema(agreeSchema, { agree: true }), { ok: true });

  // A checkbox WITH options still needs a non-empty options array.
  assert.equal(
    validateFormSchema({ fields: [{ id: 'c', type: 'checkbox', label: 'Pick', options: [] }] }).ok,
    false,
  );
});

test('reconciliation: toFormSchema preserves submitButtonText / successMessage', () => {
  const parsed = toFormSchema({
    fields: [{ id: 'name', type: 'text', label: 'Name', required: true }],
    submitButtonText: 'Send it',
    successMessage: 'Got it, thanks!',
  });
  assert.equal(parsed.submitButtonText, 'Send it');
  assert.equal(parsed.successMessage, 'Got it, thanks!');
  assert.equal(parsed.fields.length, 1);
});
