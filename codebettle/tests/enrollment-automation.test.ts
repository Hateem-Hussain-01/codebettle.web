import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { countCertificates } from '../lib/db/certificates';
import { getAuditLog } from '../lib/db/audit';
import {
  createEnrollmentService,
  setCertificateEligibility,
  updateEnrollmentService,
} from '../lib/services/enrollment-service';
import type { Actor } from '../lib/services/errors';

const D = (s: string) => new Date(s);

const ADMIN: Actor = { id: 'admin-1', role: 'admin', name: 'Admin' };
const INST: Actor = { id: 'inst-1', role: 'instructor', name: 'Usman' };

let fake: FakeDb;

function course(id: string, status: string) {
  return {
    id, slug: `slug-${id}`, title: `Course ${id}`, description: 'Intro', longDescription: '',
    thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
    instructorId: 'inst-1', zoomLink: null, schedule: null, status,
    isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
    tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
    createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
  };
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-03') },
  ]);
  fake.seed('Course', [course('course-1', 'published'), course('course-2', 'archived')]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
    { id: 'enr-2', studentId: 'stu-2', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: true, completedAt: D('2024-06-01'), paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
    { id: 'enr-3', studentId: 'stu-2', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'free', amountPaid: 0, couponUsed: null, deletedAt: null },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
});

test('marking complete + eligible auto-issues exactly one certificate, with an audit entry', async () => {
  const updated = await updateEnrollmentService(ADMIN, 'enr-1', { isCompleted: true, certificateEligible: true });
  assert.ok('enrollment' in updated, JSON.stringify(updated));
  assert.ok(updated.certificate !== null, 'expected an auto-issued certificate in the result');
  assert.equal(updated.certificate?.enrollmentId, 'enr-1');
  assert.equal(await countCertificates(), 1);
  const audit = await getAuditLog();
  assert.ok(audit.some((e) => e.action === 'certificate.auto-issue'), JSON.stringify(audit.map((e) => e.action)));
});

test('marking complete with eligible=false issues nothing', async () => {
  const updated = await updateEnrollmentService(ADMIN, 'enr-1', { isCompleted: true, certificateEligible: false });
  assert.ok('enrollment' in updated, JSON.stringify(updated));
  assert.equal(updated.certificate, null);
  assert.equal(await countCertificates(), 0);
});

test('marking complete with eligibility unset issues nothing', async () => {
  const updated = await updateEnrollmentService(ADMIN, 'enr-1', { isCompleted: true });
  assert.ok('enrollment' in updated, JSON.stringify(updated));
  assert.equal(updated.certificate, null);
  assert.equal(await countCertificates(), 0);
});

test('setting eligible=true on an already-complete enrolment issues one certificate', async () => {
  const result = await setCertificateEligibility(INST, 'enr-2', true);
  assert.ok('enrollment' in result, JSON.stringify(result));
  assert.ok(result.certificate !== null, 'expected an auto-issued certificate in the result');
  assert.equal(result.certificate?.enrollmentId, 'enr-2');
  assert.equal(await countCertificates(), 1);
});

test('a second completion update does NOT create a duplicate certificate', async () => {
  const first = await updateEnrollmentService(ADMIN, 'enr-1', { isCompleted: true, certificateEligible: true });
  assert.ok('enrollment' in first && first.certificate !== null);
  assert.equal(await countCertificates(), 1);
  const second = await updateEnrollmentService(ADMIN, 'enr-1', { isCompleted: true });
  assert.ok('enrollment' in second, JSON.stringify(second));
  assert.equal(second.certificate, null);
  assert.equal(await countCertificates(), 1);
});

test('enrolment into an archived course is rejected with 400', async () => {
  const created = await createEnrollmentService(ADMIN, {
    studentId: 'stu-1', courseId: 'course-2', paymentStatus: 'free', amountPaid: 0,
  });
  assert.ok('error' in created && created.status === 400, JSON.stringify(created));
  assert.match(created.error, /archived/);
});
