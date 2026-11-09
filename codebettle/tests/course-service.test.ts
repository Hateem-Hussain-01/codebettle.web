import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { getAuditLog } from '../lib/db/audit';
import { getCourseById } from '../lib/db/courses';
import {
  createCourseService,
  createLessonService,
  createModuleService,
  deleteCourseService,
  deleteLessonService,
  deleteModuleService,
  setCourseStatus,
  updateCourseService,
  updateLessonService,
  updateModuleService,
} from '../lib/services/course-service';
import type { Actor } from '../lib/services/errors';

const D = (s: string) => new Date(s);

const ADMIN: Actor = { id: 'admin-1', role: 'admin', name: 'Admin' };
const INST1: Actor = { id: 'inst-1', role: 'instructor', name: 'Usman' };
const INST2: Actor = { id: 'inst-2', role: 'instructor', name: 'Sara' };
const STUDENT: Actor = { id: 'stu-1', role: 'student', name: 'Ali' };

let fake: FakeDb;

function baseCourse() {
  return {
    slug: 'web-101',
    title: 'Web 101',
    description: 'Intro',
    longDescription: 'Long intro',
    thumbnail: '/t.png',
    category: 'Web Development' as const,
    level: 'beginner' as const,
    price: 5000,
    isFree: false,
    instructorId: 'inst-1',
    zoomLink: 'https://zoom.example/x',
    requirements: ['Laptop'],
    whatYouLearn: ['HTML'],
    tags: ['web'],
  };
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-2', name: 'Sara', email: 'sara@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
  ]);
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'web-101', title: 'Web 101', description: 'Intro', longDescription: 'Long intro',
      thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'draft',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: ['Laptop'], whatYouLearn: ['HTML'],
      tags: ['web'], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-02'),
    },
    {
      id: 'course-2', slug: 'other-101', title: 'Other 101', description: 'Other', longDescription: 'Other',
      thumbnail: '/t.png', category: 'Programming', level: 'beginner', pricePkr: 0, isFree: true,
      instructorId: 'inst-2', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('Module', [
    { id: 'mod-1', courseId: 'course-1', title: 'Basics', position: 1 },
    { id: 'mod-2', courseId: 'course-1', title: 'Advanced', position: 2 },
  ]);
  fake.seed('Lesson', [
    { id: 'les-1', moduleId: 'mod-1', title: 'L1', description: '', position: 1, recordingUrl: null, materials: [], duration: '10m', date: null },
    { id: 'les-2', moduleId: 'mod-1', title: 'L2', description: '', position: 2, recordingUrl: null, materials: [], duration: '20m', date: null },
    { id: 'les-3', moduleId: 'mod-2', title: 'L3', description: '', position: 1, recordingUrl: null, materials: [], duration: '15m', date: null },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
});

test('admin creates a draft course; duplicate slug is rejected', async () => {
  const created = await createCourseService(ADMIN, { ...baseCourse(), slug: 'react-101', title: 'React 101' });
  assert.ok('course' in created, JSON.stringify(created));
  assert.equal(created.course.status, 'draft');
  assert.equal(created.course.instructorId, 'inst-1');

  const dupe = await createCourseService(ADMIN, { ...baseCourse(), slug: 'web-101', title: 'Again' });
  assert.ok('error' in dupe && dupe.status === 400, JSON.stringify(dupe));
});

test('instructor creates a course for themselves only; student cannot create', async () => {
  const created = await createCourseService(INST1, { ...baseCourse(), slug: 'mine-101', title: 'Mine', instructorId: undefined });
  assert.ok('course' in created, JSON.stringify(created));
  assert.equal(created.course.instructorId, 'inst-1');

  const forOther = await createCourseService(INST1, { ...baseCourse(), slug: 'theirs-101', title: 'Theirs', instructorId: 'inst-2' });
  assert.ok('error' in forOther && forOther.status === 403, JSON.stringify(forOther));

  const asStudent = await createCourseService(STUDENT, { ...baseCourse(), slug: 'stu-101', title: 'Stu' });
  assert.ok('error' in asStudent && asStudent.status === 403, JSON.stringify(asStudent));
});

test('admin can assign an instructor; a non-instructor target is rejected', async () => {
  const bad = await createCourseService(ADMIN, { ...baseCourse(), slug: 'bad-101', title: 'Bad', instructorId: 'stu-1' });
  assert.ok('error' in bad && bad.status === 400, JSON.stringify(bad));

  const missing = await createCourseService(ADMIN, { ...baseCourse(), slug: 'ghost-101', title: 'Ghost', instructorId: 'nope' });
  assert.ok('error' in missing && missing.status === 404, JSON.stringify(missing));
});

test('instructor edits own course; cannot touch another instructor’s course; student gets 403', async () => {
  const own = await updateCourseService(INST1, 'course-1', { title: 'Web 101 v2' });
  assert.ok('course' in own && own.course.title === 'Web 101 v2', JSON.stringify(own));

  const others = await updateCourseService(INST1, 'course-2', { title: 'Hijack' });
  assert.ok('error' in others && others.status === 403, JSON.stringify(others));

  const asStudent = await updateCourseService(STUDENT, 'course-1', { title: 'Hijack' });
  assert.ok('error' in asStudent && asStudent.status === 403, JSON.stringify(asStudent));

  const missing = await updateCourseService(ADMIN, 'nope', { title: 'x' });
  assert.ok('error' in missing && missing.status === 404, JSON.stringify(missing));
});

test('instructor cannot change status or instructorId; admin can', async () => {
  const status = await updateCourseService(INST1, 'course-1', { status: 'published' });
  assert.ok('error' in status && status.status === 403, JSON.stringify(status));

  const instructor = await updateCourseService(INST1, 'course-1', { instructorId: 'inst-2' });
  assert.ok('error' in instructor && instructor.status === 403, JSON.stringify(instructor));

  const adminStatus = await updateCourseService(ADMIN, 'course-1', { status: 'published' });
  assert.ok('course' in adminStatus && adminStatus.course.status === 'published', JSON.stringify(adminStatus));
});

test('setCourseStatus is admin-only', async () => {
  const asInstructor = await setCourseStatus(INST1, 'course-1', 'published');
  assert.ok('error' in asInstructor && asInstructor.status === 403, JSON.stringify(asInstructor));

  const asAdmin = await setCourseStatus(ADMIN, 'course-1', 'published');
  assert.ok('course' in asAdmin && asAdmin.course.status === 'published', JSON.stringify(asAdmin));
});

test('admin soft-deletes a course; it disappears from reads; second delete is 404', async () => {
  const deleted = await deleteCourseService(ADMIN, 'course-1');
  assert.ok('success' in deleted, JSON.stringify(deleted));
  assert.equal(await getCourseById('course-1'), null);

  const again = await deleteCourseService(ADMIN, 'course-1');
  assert.ok('error' in again && again.status === 404, JSON.stringify(again));

  const asInstructor = await deleteCourseService(INST1, 'course-2');
  assert.ok('error' in asInstructor && asInstructor.status === 403, JSON.stringify(asInstructor));
});

test('module CRUD: create appends, reorder stays contiguous, delete reindexes and drops lessons', async () => {
  const created = await createModuleService(ADMIN, 'course-1', { title: 'New Module' });
  assert.ok('module' in created, JSON.stringify(created));
  assert.equal(created.module.title, 'New Module');

  const moved = await updateModuleService(ADMIN, 'course-1', 'mod-1', { position: 2 });
  assert.ok('module' in moved, JSON.stringify(moved));
  const afterMove = await getCourseById('course-1');
  assert.deepEqual(
    afterMove?.modules.map((m) => m.id),
    ['mod-2', 'mod-1', created.module.id],
  );

  const deleted = await deleteModuleService(ADMIN, 'course-1', 'mod-2');
  assert.ok('success' in deleted, JSON.stringify(deleted));
  const afterDelete = await getCourseById('course-1');
  assert.deepEqual(
    afterDelete?.modules.map((m) => m.id),
    ['mod-1', created.module.id],
  );
  // mod-2's lesson (les-3) is gone with the module.
  assert.equal(afterDelete?.modules.flatMap((m) => m.lessons).some((l) => l.id === 'les-3'), false);
  // Positions are 1-based and contiguous; lessons per module are unchanged.
  assert.deepEqual(
    afterDelete?.modules.map((m) => m.lessons.length),
    [2, 0],
  );
});

test('lesson CRUD: create appends, reorder stays contiguous, delete reindexes', async () => {
  const created = await createLessonService(ADMIN, 'course-1', 'mod-1', { title: 'L3', duration: '5m' });
  assert.ok('lesson' in created, JSON.stringify(created));
  assert.equal(created.lesson.title, 'L3');

  const moved = await updateLessonService(ADMIN, 'course-1', 'mod-1', 'les-1', { position: 3 });
  assert.ok('lesson' in moved, JSON.stringify(moved));
  const afterMove = await getCourseById('course-1');
  assert.deepEqual(
    afterMove?.modules.find((m) => m.id === 'mod-1')?.lessons.map((l) => l.id),
    ['les-2', created.lesson.id, 'les-1'],
  );

  const deleted = await deleteLessonService(ADMIN, 'course-1', 'mod-1', 'les-2');
  assert.ok('success' in deleted, JSON.stringify(deleted));
  const afterDelete = await getCourseById('course-1');
  assert.deepEqual(
    afterDelete?.modules.find((m) => m.id === 'mod-1')?.lessons.map((l) => l.id),
    [created.lesson.id, 'les-1'],
  );
});

test('instructor module/lesson writes work on own course only', async () => {
  const own = await createModuleService(INST1, 'course-1', { title: 'Mine' });
  assert.ok('module' in own, JSON.stringify(own));

  const others = await createModuleService(INST1, 'course-2', { title: 'Not mine' });
  assert.ok('error' in others && others.status === 403, JSON.stringify(others));

  const lessonOther = await createLessonService(INST2, 'course-1', 'mod-1', { title: 'Nope' });
  assert.ok('error' in lessonOther && lessonOther.status === 403, JSON.stringify(lessonOther));

  const wrongModule = await createLessonService(ADMIN, 'course-1', 'nope', { title: 'Nope' });
  assert.ok('error' in wrongModule && wrongModule.status === 404, JSON.stringify(wrongModule));
});

test('course mutations write audit entries', async () => {
  await createCourseService(ADMIN, { ...baseCourse(), slug: 'audit-101', title: 'Audit' });
  await updateCourseService(ADMIN, 'course-1', { title: 'Renamed' });
  const entries = await getAuditLog();
  const actions = entries.map((e) => e.action);
  assert.ok(actions.includes('course.create'), actions.join(','));
  assert.ok(actions.includes('course.update'), actions.join(','));
});
