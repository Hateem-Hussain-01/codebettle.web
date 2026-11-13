import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient, type DbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  createBatch,
  deleteBatch,
  getBatchById,
  getBatchesByCourse,
  getBatchesByInstructor,
  getEnrollmentBatchLabel,
  getOpenBatchForCourse,
  nextBatchNumber,
  updateBatch,
} from '../lib/db/batches';
import { formatBatchLabel } from '../lib/db/types';
import { createBatchService, deleteBatchService, updateBatchService } from '../lib/services/batch-service';
import type { Batch } from '../lib/db/types';

const D = (s: string) => new Date(s);

let fake: FakeDb;

function seedBase() {
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'python', title: 'Python Crash Course', description: 'Intro', longDescription: '',
      thumbnail: '/t.png', category: 'Programming', level: 'beginner', pricePkr: 1500, isFree: false,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('User', [
    { id: 'inst-1', name: 'Ahmad', email: 'ahmad@example.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'admin-1', name: 'Admin', email: 'admin@example.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('Batch', [
    { id: 'batch-8', courseId: 'course-1', batchNumber: 8, status: 'ongoing', startDate: D('2026-10-01'), endDate: null, capacity: 30, instructorId: 'inst-1', createdAt: D('2026-09-01'), updatedAt: D('2026-09-01') },
    { id: 'batch-9', courseId: 'course-1', batchNumber: 9, status: 'upcoming', startDate: D('2026-12-01'), endDate: null, capacity: null, instructorId: null, createdAt: D('2026-09-01'), updatedAt: D('2026-09-01') },
    { id: 'batch-7', courseId: 'course-1', batchNumber: 7, status: 'completed', startDate: D('2026-06-01'), endDate: D('2026-09-01'), capacity: null, instructorId: null, createdAt: D('2026-05-01'), updatedAt: D('2026-05-01') },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', batchId: 'batch-8', enrolledAt: D('2026-10-02'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 1500, couponUsed: null, deletedAt: null },
  ]);
}

const admin = { id: 'admin-1', role: 'admin' as const, isAdmin: true, isTeacher: false };
const teacher = { id: 'inst-1', role: 'instructor' as const, isAdmin: false, isTeacher: true };

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  seedBase();
});

test.afterEach(() => {
  __resetDbClient();
});

test('formatBatchLabel renders BATCH-<n>', () => {
  assert.equal(formatBatchLabel(8), 'BATCH-8');
  assert.equal(formatBatchLabel(9), 'BATCH-9');
});

test('getBatchesByCourse returns newest batch number first with enrolled counts', async () => {
  const batches = await getBatchesByCourse('course-1');
  assert.deepEqual(batches.map(b => b.batchNumber), [9, 8, 7]);
  assert.equal(batches.find(b => b.batchNumber === 8)?.enrolledCount, 1);
  assert.equal(batches.find(b => b.batchNumber === 9)?.enrolledCount, 0);
});

test('getOpenBatchForCourse returns the latest upcoming/ongoing batch', async () => {
  const open = await getOpenBatchForCourse('course-1');
  assert.ok(open);
  assert.equal(open.batchNumber, 9);
});

test('getOpenBatchForCourse returns null when only completed batches exist', async () => {
  // Complete the open batches.
  await updateBatch('batch-9', { status: 'completed' });
  await updateBatch('batch-8', { status: 'completed' });
  assert.equal(await getOpenBatchForCourse('course-1'), null);
});

test('getBatchesByInstructor returns batches taught by that instructor', async () => {
  const batches = await getBatchesByInstructor('inst-1');
  assert.deepEqual(batches.map(b => b.batchNumber), [8]);
});

test('nextBatchNumber is max + 1', async () => {
  assert.equal(await nextBatchNumber('course-1'), 10);
});

test('createBatch defaults the number to next free and the status to upcoming', async () => {
  const created = await createBatch({ courseId: 'course-1' });
  assert.ok(!('error' in created), JSON.stringify(created));
  assert.equal(created.batch.batchNumber, 10);
  assert.equal(created.batch.status, 'upcoming');
});

test('createBatch rejects a duplicate batch number for the same course', async () => {
  const created = await createBatch({ courseId: 'course-1', batchNumber: 8 });
  assert.ok('error' in created);
  assert.match(created.error, /already exists/);
});

test('updateBatch changes status, dates, capacity and instructor', async () => {
  const updated = await updateBatch('batch-9', {
    status: 'ongoing',
    startDate: '2026-11-15',
    capacity: 25,
    instructorId: 'inst-1',
  });
  assert.ok(updated);
  assert.equal(updated.status, 'ongoing');
  assert.equal(updated.startDate, '2026-11-15');
  assert.equal(updated.capacity, 25);
  assert.equal(updated.instructorId, 'inst-1');
});

test('deleteBatch is refused when students are enrolled in it', async () => {
  const deleted = await deleteBatch('batch-8');
  assert.ok('error' in deleted);
  assert.match(deleted.error, /enrolled/);
});

test('deleteBatch removes an empty batch', async () => {
  const deleted = await deleteBatch('batch-9');
  assert.ok(!('error' in deleted), JSON.stringify(deleted));
  assert.equal(await getBatchById('batch-9'), null);
});

test('getEnrollmentBatchLabel renders the enrolment batch as BATCH-<n>', async () => {
  assert.equal(await getEnrollmentBatchLabel('enr-1'), 'BATCH-8');
  assert.equal(await getEnrollmentBatchLabel('missing-enrollment'), null);
});

test('batch service: non-admins cannot create, update or delete batches', async () => {
  const created = await createBatchService(teacher, { courseId: 'course-1' });
  assert.ok('error' in created && created.status === 403);
  const updated = await updateBatchService(teacher, 'batch-9', { status: 'ongoing' });
  assert.ok('error' in updated && updated.status === 403);
  const deleted = await deleteBatchService(teacher, 'batch-9');
  assert.ok('error' in deleted && deleted.status === 403);
});

test('batch service: admin creates a batch (auto number) and the audit is written', async () => {
  const created = await createBatchService(admin, { courseId: 'course-1', status: 'upcoming' });
  assert.ok(!('error' in created), JSON.stringify(created));
  assert.equal(created.batch.batchNumber, 10);
});

test('batch service: creating a batch for a missing course is a 404', async () => {
  const created = await createBatchService(admin, { courseId: 'no-such-course' });
  assert.ok('error' in created && created.status === 404);
});

test('batch service: a non-teacher cannot be the batch instructor', async () => {
  const created = await createBatchService(admin, { courseId: 'course-1', instructorId: 'stu-1' });
  assert.ok('error' in created && created.status === 400);
  assert.match(created.error, /teacher/);
});

test('batch service: start date after end date is rejected', async () => {
  const created = await createBatchService(admin, {
    courseId: 'course-1',
    startDate: '2026-12-01',
    endDate: '2026-11-01',
  });
  assert.ok('error' in created && created.status === 400);
});

/** A client that throws Postgres 42P01 (table missing) on every Batch read — the pre-migration state. */
const missingTableError = () =>
  Object.assign(new Error('relation "public"."Batch" does not exist'), { code: '42P01' });

function missingTableClient(): DbClient {
  const throwing = {
    where: () => { throw missingTableError(); },
    orderBy: () => { throw missingTableError(); },
    first: async () => { throw missingTableError(); },
    all: async () => { throw missingTableError(); },
    create: async () => { throw missingTableError(); },
    update: async () => { throw missingTableError(); },
    delete: async () => { throw missingTableError(); },
  };
  return {
    orm: {
      public: new Proxy({}, { get: (_t, model: string) => (model === 'Batch' ? throwing : fake.orm.public[model]) }),
    },
    transaction: fake.transaction.bind(fake),
  } as unknown as DbClient;
}

test('fail-safe: missing Batch table returns empty instead of crashing', async () => {
  __setDbClient(missingTableClient());
  assert.deepEqual(await getBatchesByCourse('course-1'), []);
  assert.equal(await getOpenBatchForCourse('course-1'), null);
  assert.equal(await getBatchById('batch-8'), null);
  assert.deepEqual(await getBatchesByInstructor('inst-1'), []);
  assert.equal(await getEnrollmentBatchLabel('enr-1'), null);
  // A missing table is not a missing column — a real DB error still throws.
  const other = Object.assign(new Error('boom'), { code: 'XX000' });
  __setDbClient({
    orm: {
      public: new Proxy({}, {
        get: (_t, model: string) => (model === 'Batch'
          ? { where: () => { throw other; } }
          : fake.orm.public[model]),
      }),
    },
    transaction: fake.transaction.bind(fake),
  } as unknown as DbClient);
  await assert.rejects(() => getBatchesByCourse('course-1'), /boom/);
});

test('fail-safe: creating a batch without the table surfaces a clear error, not a crash', async () => {
  __setDbClient(missingTableClient());
  const created = await createBatch({ courseId: 'course-1' });
  assert.ok('error' in created);
  assert.match(created.error, /batch migration has not run yet/);
});
