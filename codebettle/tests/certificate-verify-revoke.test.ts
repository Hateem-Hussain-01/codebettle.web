import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient, type DbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  getCertificateByToken,
  isMissingColumnError,
  revokeCertificate,
} from '../lib/db/certificates';
import { GET } from '../app/api/certificates/verify/route';

/**
 * Phase 2 — verify states (valid / revoked / not_found) and the admin
 * revoke flow, plus the fail-safe for the Phase 2 migration not having
 * run yet (a missing batch/revokedAt column must read as "no batch /
 * not revoked", never crash).
 */

const D = (s: string) => new Date(s);
const TOKEN = 'a'.repeat(32);
const REVOKED_TOKEN = 'd'.repeat(32);

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'web-101', title: 'Web 101', description: 'Intro', longDescription: 'Long',
      thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: true, completedAt: D('2024-06-01'), paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
    { id: 'enr-2', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: true, completedAt: D('2024-06-15'), paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
  ]);
  fake.seed('Certificate', [
    { id: 'cert-1', studentId: 'stu-1', courseId: 'course-1', enrollmentId: 'enr-1', certificateNumber: 'CB-2024-001', verificationToken: TOKEN, issuedAt: D('2024-06-01'), batch: 'BATCH-8', revokedAt: null },
    { id: 'cert-2', studentId: 'stu-1', courseId: 'course-1', enrollmentId: 'enr-2', certificateNumber: 'CB-2024-002', verificationToken: REVOKED_TOKEN, issuedAt: D('2024-06-15'), batch: null, revokedAt: D('2024-07-01') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
});

test('GET verify: valid certificate returns status valid + course dates', async () => {
  const res = await GET(new NextRequest(`http://localhost/api/certificates/verify?token=${TOKEN}`));
  assert.equal(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  assert.equal(body.status, 'valid');
  assert.equal(body.valid, true);
  assert.equal(body.studentName, 'Ali');
  assert.equal(body.courseTitle, 'Web 101');
  assert.equal(body.certificateNumber, 'CB-2024-001');
  assert.equal(body.issuedAt, '2024-06-01');
  assert.equal(body.enrolledAt, '2024-05-01');
  assert.equal(body.completedAt, '2024-06-01');
  assert.equal('studentId' in body, false);
  assert.equal('email' in body, false);
  assert.equal(JSON.stringify(body).includes(TOKEN), false);
});

test('GET verify: revoked certificate returns status revoked (200, valid false)', async () => {
  const res = await GET(new NextRequest(`http://localhost/api/certificates/verify?token=${REVOKED_TOKEN}`));
  assert.equal(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  assert.equal(body.status, 'revoked');
  assert.equal(body.valid, false);
  assert.equal(body.certificateNumber, 'CB-2024-002');
  assert.equal(body.revokedAt, '2024-07-01');
  assert.equal('studentName' in body, false, 'a revoked certificate exposes no student facts');
});

test('GET verify: unknown token returns status not_found (404)', async () => {
  const res = await GET(new NextRequest(`http://localhost/api/certificates/verify?token=${'c'.repeat(32)}`));
  assert.equal(res.status, 404);
  const body = await res.json() as Record<string, unknown>;
  assert.equal(body.status, 'not_found');
});

test('revokeCertificate sets revokedAt, is idempotent, and 404s when unknown', async () => {
  const revoked = await revokeCertificate('cert-1');
  assert.ok(!('error' in revoked), 'revoke should succeed');
  assert.equal(revoked.certificate.revokedAt, new Date().toISOString().slice(0, 10));
  assert.equal(revoked.certificate.batch, 'BATCH-8', 'revoking keeps the batch');

  // The verify path now sees it as revoked.
  const found = await getCertificateByToken(TOKEN);
  assert.ok(found?.revokedAt, 'certificate must read back as revoked');

  // Second revoke is a no-op returning the same certificate.
  const again = await revokeCertificate('cert-1');
  assert.ok(!('error' in again));
  assert.equal(again.certificate.revokedAt, revoked.certificate.revokedAt);

  assert.deepEqual(await revokeCertificate('nope'), { error: 'Certificate not found' });
});

test('isMissingColumnError only matches missing-column failures', () => {
  const missing = Object.assign(new Error('column "public"."Certificate"."revokedAt" does not exist'), { code: '42703' });
  assert.equal(isMissingColumnError(missing, ['batch', 'revokedAt']), true);
  assert.equal(isMissingColumnError(missing, ['certificateTemplateHtml']), false);
  assert.equal(isMissingColumnError(new Error('connection refused'), ['batch']), false);
  assert.equal(isMissingColumnError(Object.assign(new Error('column "public"."Course"."title" does not exist'), { code: '42703' }), ['batch']), false);
  assert.equal(isMissingColumnError(null, ['batch']), false);
});

test('getCertificateByToken falls back to the legacy select when the migration has not run', async () => {
  // A client that throws Postgres 42703 on the full-column read, then
  // answers the legacy (pre-migration columns) read.
  const row = {
    id: 'cert-9', studentId: 'stu-1', courseId: 'course-1', enrollmentId: 'enr-1',
    certificateNumber: 'CB-2024-009', verificationToken: TOKEN, issuedAt: D('2024-06-01'),
  };
  const missingError = () => Object.assign(
    new Error('column "public"."Certificate"."revokedAt" does not exist'),
    { code: '42703' },
  );
  const chain = {
    select: () => ({ first: async () => row }),
    first: async (): Promise<never> => { throw missingError(); },
  };
  const stub = { orm: { public: { Certificate: { where: () => chain } } } };
  __setDbClient(stub as unknown as DbClient);
  try {
    const found = await getCertificateByToken(TOKEN);
    assert.equal(found?.certificateNumber, 'CB-2024-009');
    assert.equal(found?.revokedAt, null, 'missing column reads as not revoked');
    assert.equal(found?.batch, null, 'missing column reads as no batch');
  } finally {
    __setDbClient(fake.asClient());
  }
});
