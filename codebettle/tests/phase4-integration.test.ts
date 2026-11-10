/**
 * Phase 4 integration test (coordinator): the notification hooks wired
 * into the enrolment / application services actually fire, and the
 * certificate auto-issuance notifies exactly once per new certificate.
 *
 * The workers tested their services in isolation; this file tests the
 * wiring between them, through the real service functions, on the fake db.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { listNotificationsForUser } from '../lib/db/notifications';
import { getCertificatesByStudent } from '../lib/db/certificates';
import {
  createEnrollmentService,
  updateEnrollmentService,
} from '../lib/services/enrollment-service';
import { reviewApplicationService } from '../lib/services/application-service';
import type { Actor } from '../lib/services/errors';

const D = (s: string) => new Date(s);

const ADMIN: Actor = { id: 'admin-1', role: 'admin', name: 'Admin' };

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
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
      tags: [], enrolledCount: 1, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, certificateEligible: null, deletedAt: null },
  ]);
  fake.seed('InstructorApplication', [
    { id: 'app-1', name: 'Bilal Ahmed', email: 'bilal@example.com', phone: null, expertise: 'Python', experience: '5 years', message: null, status: 'pending', reviewedBy: null, createdAt: D('2024-05-10') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
});

test('creating an enrolment notifies the student', async () => {
  const created = await createEnrollmentService(ADMIN, {
    studentId: 'stu-2', courseId: 'course-1', paymentStatus: 'free', amountPaid: 0,
  });
  assert.ok('enrollment' in created, JSON.stringify(created));
  const notes = await listNotificationsForUser('stu-2');
  assert.equal(notes.items.length, 1);
  assert.equal(notes.items[0].type, 'enrollment');
  assert.match(notes.items[0].title, /Web 101/);
});

test('completing an eligible enrolment auto-issues a certificate and notifies twice (completion + certificate)', async () => {
  const updated = await updateEnrollmentService(ADMIN, 'enr-1', {
    isCompleted: true, certificateEligible: true,
  });
  assert.ok('enrollment' in updated, JSON.stringify(updated));
  assert.ok(updated.certificate, 'expected an auto-issued certificate');
  assert.match(updated.certificate.certificateNumber, /^CB-\d{4}-001$/);

  const certs = await getCertificatesByStudent('stu-1');
  assert.equal(certs.length, 1);

  const notes = await listNotificationsForUser('stu-1');
  const types = notes.items.map((n) => n.type).sort();
  assert.deepEqual(types, ['certificate', 'completion']);
  const certNote = notes.items.find((n) => n.type === 'certificate');
  assert.match(certNote!.body, /CB-\d{4}-001/);
});

test('completing without eligibility notifies completion only, issues nothing', async () => {
  const updated = await updateEnrollmentService(ADMIN, 'enr-1', { isCompleted: true });
  assert.ok('enrollment' in updated, JSON.stringify(updated));
  assert.equal(updated.certificate, null);
  const notes = await listNotificationsForUser('stu-1');
  assert.deepEqual(notes.items.map((n) => n.type), ['completion']);
});

test('reviewing an application notifies the admins', async () => {
  const reviewed = await reviewApplicationService(ADMIN, 'app-1', 'approved');
  assert.ok('application' in reviewed, JSON.stringify(reviewed));
  const notes = await listNotificationsForUser('admin-1');
  assert.equal(notes.items.length, 1);
  assert.equal(notes.items[0].type, 'application');
  assert.match(notes.items[0].title, /approved/);
});

test('a second completion update does not duplicate the certificate or its notification', async () => {
  await updateEnrollmentService(ADMIN, 'enr-1', { isCompleted: true, certificateEligible: true });
  const again = await updateEnrollmentService(ADMIN, 'enr-1', { isCompleted: true });
  assert.ok('enrollment' in again, JSON.stringify(again));
  assert.equal(again.certificate, null);

  const certs = await getCertificatesByStudent('stu-1');
  assert.equal(certs.length, 1);
  const notes = await listNotificationsForUser('stu-1');
  // First update: completion + certificate. Second update: nothing new
  // (not newly completed, no new certificate).
  assert.equal(notes.items.length, 2);
  assert.equal(notes.items.filter((n) => n.type === 'certificate').length, 1);
});
