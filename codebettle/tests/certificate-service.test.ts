import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { countCertificates } from '../lib/db/certificates';
import { issueCertificateWithRetry } from '../lib/services/certificate-service';

const D = (s: string) => new Date(s);
const YEAR = new Date().getFullYear();
const num = (n: number) => `CB-${YEAR}-${String(n).padStart(3, '0')}`;

let fake: FakeDb;

function seedBase() {
  fake.seed('User', [
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-3', name: 'Omar', email: 'omar@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'web-101', title: 'Web 101', description: 'Intro', longDescription: '',
      thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: true, completedAt: D('2024-06-01'), paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
    { id: 'enr-2', studentId: 'stu-2', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: true, completedAt: D('2024-06-01'), paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
    { id: 'enr-3', studentId: 'stu-3', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: true, completedAt: D('2024-06-01'), paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
  ]);
}

function seedCert(id: string, enrollmentId: string, studentId: string, certificateNumber: string) {
  fake.seed('Certificate', [
    { id, studentId, courseId: 'course-1', enrollmentId, certificateNumber, verificationToken: 'tok', issuedAt: D('2024-06-02') },
  ]);
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  seedBase();
});

test.afterEach(() => {
  __resetDbClient();
});

test('retry picks the next free number when the would-be number is already taken', async () => {
  // The next number would be CB-<year>-001 (count is 0); pre-seed it taken.
  seedCert('cert-0', 'enr-1', 'stu-1', num(1));
  const issued = await issueCertificateWithRetry({
    studentId: 'stu-2', courseId: 'course-1', enrollmentId: 'enr-2',
  });
  assert.ok('certificate' in issued, JSON.stringify(issued));
  assert.equal(issued.certificate.certificateNumber, num(2));
});

test('sequential issues get distinct numbers', async () => {
  const first = await issueCertificateWithRetry({ studentId: 'stu-1', courseId: 'course-1', enrollmentId: 'enr-1' });
  const second = await issueCertificateWithRetry({ studentId: 'stu-2', courseId: 'course-1', enrollmentId: 'enr-2' });
  const third = await issueCertificateWithRetry({ studentId: 'stu-3', courseId: 'course-1', enrollmentId: 'enr-3' });
  assert.ok('certificate' in first && 'certificate' in second && 'certificate' in third);
  assert.equal(first.certificate.certificateNumber, num(1));
  assert.equal(second.certificate.certificateNumber, num(2));
  assert.equal(third.certificate.certificateNumber, num(3));
  assert.equal(await countCertificates(), 3);
});

test('an explicitly requested number is used as-is', async () => {
  const issued = await issueCertificateWithRetry({
    studentId: 'stu-1', courseId: 'course-1', enrollmentId: 'enr-1', certificateNumber: 'CB-2099-999',
  });
  assert.ok('certificate' in issued, JSON.stringify(issued));
  assert.equal(issued.certificate.certificateNumber, 'CB-2099-999');
});

test('maxAttempts exhaustion returns an error', async () => {
  // Count is 5, so seq starts at 6 — pre-seed 6..10 taken, all 5 attempts collide.
  seedCert('cert-6', 'enr-1', 'stu-1', num(6));
  seedCert('cert-7', 'enr-1', 'stu-1', num(7));
  seedCert('cert-8', 'enr-1', 'stu-1', num(8));
  seedCert('cert-9', 'enr-1', 'stu-1', num(9));
  seedCert('cert-10', 'enr-1', 'stu-1', num(10));
  assert.equal(await countCertificates(), 5);
  const issued = await issueCertificateWithRetry(
    { studentId: 'stu-2', courseId: 'course-1', enrollmentId: 'enr-2' },
    { maxAttempts: 5 },
  );
  assert.ok('error' in issued, JSON.stringify(issued));
  assert.match(issued.error, /unique certificate number/);
  assert.equal(await countCertificates(), 5);
});

test('issuing twice for the same enrolment is an error, not a new number', async () => {
  const first = await issueCertificateWithRetry({ studentId: 'stu-1', courseId: 'course-1', enrollmentId: 'enr-1' });
  assert.ok('certificate' in first);
  const again = await issueCertificateWithRetry({ studentId: 'stu-1', courseId: 'course-1', enrollmentId: 'enr-1' });
  assert.ok('error' in again && again.status === 400, JSON.stringify(again));
  assert.match(again.error, /already exists/);
});

test('issuing a certificate stores the enrolment batch (BATCH-<n>) on the certificate', async () => {
  fake.seed('Batch', [
    { id: 'batch-8', courseId: 'course-1', batchNumber: 8, status: 'ongoing', startDate: null, endDate: null, capacity: null, instructorId: null, createdAt: D('2024-04-01'), updatedAt: D('2024-04-01') },
  ]);
  // Point the enrolment at the batch (the seed has no batchId).
  const { getEnrollmentById } = await import('../lib/db/enrollments');
  const { updateEnrollment } = await import('../lib/db/enrollments');
  await updateEnrollment('enr-1', { batchId: 'batch-8' });
  assert.equal((await getEnrollmentById('enr-1'))?.batchId, 'batch-8');

  const issued = await issueCertificateWithRetry({ studentId: 'stu-1', courseId: 'course-1', enrollmentId: 'enr-1' });
  assert.ok('certificate' in issued, JSON.stringify(issued));
  assert.equal(issued.certificate.batch, 'BATCH-8');
});

test('issuing a certificate for an enrolment without a batch stores no batch (legacy fallback applies at render)', async () => {
  const issued = await issueCertificateWithRetry({ studentId: 'stu-1', courseId: 'course-1', enrollmentId: 'enr-1' });
  assert.ok('certificate' in issued, JSON.stringify(issued));
  assert.equal(issued.certificate.batch, null);
});

test('an explicitly requested batch wins over the enrolment batch', async () => {
  fake.seed('Batch', [
    { id: 'batch-8', courseId: 'course-1', batchNumber: 8, status: 'ongoing', startDate: null, endDate: null, capacity: null, instructorId: null, createdAt: D('2024-04-01'), updatedAt: D('2024-04-01') },
  ]);
  const { updateEnrollment } = await import('../lib/db/enrollments');
  await updateEnrollment('enr-1', { batchId: 'batch-8' });

  const issued = await issueCertificateWithRetry({
    studentId: 'stu-1', courseId: 'course-1', enrollmentId: 'enr-1', batch: 'BATCH-3',
  });
  assert.ok('certificate' in issued, JSON.stringify(issued));
  assert.equal(issued.certificate.batch, 'BATCH-3');
});
