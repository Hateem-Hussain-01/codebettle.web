import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { getStudents, getUserByEmail, getUserById, listUsers } from '../lib/db/users';
import { getCourseById, getPublishedCourses, listCourses } from '../lib/db/courses';
import {
  createEnrollment,
  getEnrollmentsByStudent,
  isEnrolled,
  markLessonComplete,
} from '../lib/db/enrollments';
import { getCertificatesByStudent, issueCertificate } from '../lib/db/certificates';
import { validateCoupon } from '../lib/db/coupons';
import { getCourseAnnouncements, getSiteWideAnnouncements } from '../lib/db/announcements';
import { getReviewsByCourse } from '../lib/db/reviews';
import { getPostBySlug, getPublishedPosts } from '../lib/db/blog';
import { listTestimonials } from '../lib/db/testimonials';

const D = (s: string) => new Date(s);

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());

  fake.seed('User', [
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-03') },
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'web-101', title: 'Web 101', description: 'Intro', longDescription: null,
      thumbnail: '/t.png', category: 'Web_Development', level: 'Beginner', pricePkr: 5000, isFree: false,
      instructorId: 'inst-1', zoomLink: null, schedule: { scheduleType: 'weekends', classTime: '9:00 AM - 5:00 PM', classDuration: '8 hours', startDate: '2024-05-10' }, status: 'published',
      isFeatured: true, isCompleted: false, completedAt: null, requirements: ['Laptop'], whatYouLearn: ['HTML'],
      tags: ['web'], enrolledCount: 1, rating: 4.5, reviewCount: 1,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-02'),
    },
    {
      id: 'course-2', slug: 'draft-1', title: 'Draft', description: 'Draft', longDescription: null,
      thumbnail: '/t.png', category: 'Programming', level: 'Beginner', pricePkr: 0, isFree: true,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'draft',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('Module', [
    { id: 'mod-1', courseId: 'course-1', title: 'Basics', description: '', position: 1 },
    { id: 'mod-2', courseId: 'course-1', title: 'Advanced', description: '', position: 2 },
  ]);
  fake.seed('Lesson', [
    { id: 'les-1', moduleId: 'mod-1', title: 'L1', description: '', durationMinutes: 10, position: 1, videoUrl: null, content: null, date: D('2024-05-10'), isFree: true },
    { id: 'les-2', moduleId: 'mod-1', title: 'L2', description: '', durationMinutes: 20, position: 2, videoUrl: null, content: null, date: D('2024-05-10'), isFree: false },
    { id: 'les-3', moduleId: 'mod-2', title: 'L3', description: '', durationMinutes: 15, position: 1, videoUrl: null, content: null, date: D('2024-05-10'), isFree: false },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
  ]);
  fake.seed('LessonProgress', [
    { enrollmentId: 'enr-1', lessonId: 'les-1', completedAt: D('2024-05-02') },
  ]);
  fake.seed('Certificate', [
    { id: 'cert-1', studentId: 'stu-1', courseId: 'course-1', enrollmentId: 'enr-1', certificateNumber: 'CB-0001', verificationToken: 'a'.repeat(32), issuedAt: D('2024-06-01') },
  ]);
  fake.seed('Coupon', [
    { id: 'coup-1', code: 'WELCOME10', type: 'percentage', value: 10, maxUses: 100, usedCount: 2, expiresAt: D('2030-01-01'), isActive: true, createdAt: D('2024-01-01'), applicableCourses: [] },
    { id: 'coup-2', code: 'OLD', type: 'fixed', value: 500, maxUses: 10, usedCount: 0, expiresAt: D('2020-01-01'), isActive: true, createdAt: D('2024-01-01'), applicableCourses: [] },
  ]);
  fake.seed('Announcement', [
    { id: 'ann-1', title: 'Site news', content: 'Hello', type: 'site_wide', courseId: null, authorId: 'admin-1', createdAt: D('2024-05-01'), isActive: true },
    { id: 'ann-2', title: 'Course news', content: 'Hi', type: 'course', courseId: 'course-1', authorId: 'inst-1', createdAt: D('2024-05-02'), isActive: true },
  ]);
  fake.seed('Review', [
    { id: 'rev-1', studentId: 'stu-1', courseId: 'course-1', rating: 5, comment: 'Great', createdAt: D('2024-05-03') },
  ]);
  fake.seed('BlogPost', [
    { id: 'blog-1', slug: 'hello', title: 'Hello', excerpt: 'E', content: 'Body', pdfUrl: null, thumbnail: '/b.png', category: 'General', authorId: 'admin-1', authorName: 'Admin', publishedAt: D('2024-05-01'), isPublished: true, readTime: 3, tags: ['intro'], createdAt: D('2024-05-01'), updatedAt: D('2024-05-01') },
    { id: 'blog-2', slug: 'draft-post', title: 'Draft', excerpt: 'E', content: 'Body', pdfUrl: null, thumbnail: '/b.png', category: 'General', authorId: 'admin-1', authorName: 'Admin', publishedAt: D('2024-05-01'), isPublished: false, readTime: 3, tags: [], createdAt: D('2024-05-01'), updatedAt: D('2024-05-01') },
  ]);
  fake.seed('Testimonial', [
    { id: 'test-1', studentName: 'Ali', studentAvatar: '/a.png', courseTitle: 'Web 101', rating: 5, comment: 'Loved it', date: D('2024-05-04') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
});

test('users: page-facing reads hide the hash; auth read returns it; list paginates', async () => {
  const safe = await getUserById('stu-1');
  assert.ok(safe);
  assert.equal('passwordHash' in safe, false);
  assert.deepEqual(safe.enrolledCourses, ['course-1']);

  const withHash = await getUserByEmail('ali@example.com');
  assert.ok(withHash);
  assert.equal(withHash.passwordHash, '$2b$12$hash');

  const students = await getStudents();
  assert.equal(students.length, 2);
  assert.equal(await getUserById('nope'), null);

  const page = await listUsers({ role: 'student', page: '1', limit: '1' });
  assert.equal(page.total, 2);
  assert.equal(page.items.length, 1);
  assert.equal(page.totalPages, 2);
});

test('courses: published only, nested curriculum in position order', async () => {
  const published = await getPublishedCourses();
  assert.deepEqual(published.map((c) => c.id), ['course-1']);

  const course = await getCourseById('course-1');
  assert.ok(course);
  assert.equal(course.category, 'Web Development');
  assert.equal(course.price, 5000);
  assert.deepEqual(course.modules.map((m) => m.id), ['mod-1', 'mod-2']);
  assert.deepEqual(course.modules[0].lessons.map((l) => l.id), ['les-1', 'les-2']);
  assert.equal(course.modules[0].lessons[0].date, '2024-05-10');

  const listed = await listCourses({ search: 'web' });
  assert.equal(listed.total, 1);
  const byCategory = await listCourses({ category: 'Programming' });
  assert.equal(byCategory.total, 1);
  assert.equal(byCategory.items[0].id, 'course-2');
});

test('enrollments: duplicate rejected, lesson completion is idempotent', async () => {
  assert.equal(await isEnrolled('stu-1', 'course-1'), true);
  assert.equal(await isEnrolled('stu-2', 'course-1'), false);

  const dupe = await createEnrollment({
    studentId: 'stu-1',
    courseId: 'course-1',
    paymentStatus: 'paid',
    amountPaid: 5000,
  });
  assert.ok('error' in dupe);

  const created = await createEnrollment({
    studentId: 'stu-2',
    courseId: 'course-1',
    paymentStatus: 'free',
    amountPaid: 0,
  });
  assert.ok('enrollment' in created);
  assert.equal(await isEnrolled('stu-2', 'course-1'), true);

  const mine = await getEnrollmentsByStudent('stu-1');
  assert.deepEqual(mine[0].completedLessons, ['les-1']);

  assert.ok('ok' in (await markLessonComplete('enr-1', 'les-2')));
  assert.ok('ok' in (await markLessonComplete('enr-1', 'les-2'))); // idempotent
  const after = await getEnrollmentsByStudent('stu-1');
  assert.deepEqual(after[0].completedLessons, ['les-1', 'les-2']);
  assert.ok('error' in (await markLessonComplete('enr-1', 'les-999')));
});

test('certificates: listed per student; issue requires a completed enrolment', async () => {
  const mine = await getCertificatesByStudent('stu-1');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].certificateNumber, 'CB-0001');

  const notCompleted = await issueCertificate({
    studentId: 'stu-1',
    courseId: 'course-1',
    enrollmentId: 'enr-1',
    certificateNumber: 'CB-0002',
  });
  assert.ok('error' in notCompleted);

  // A fresh completed enrolment (stu-2) can be issued — and only once.
  const created = await createEnrollment({
    studentId: 'stu-2',
    courseId: 'course-1',
    paymentStatus: 'free',
    amountPaid: 0,
  });
  assert.ok('enrollment' in created);
  const enrollmentTable = fake.tables.Enrollment;
  assert.ok(enrollmentTable);
  enrollmentTable.get(created.enrollment.id)!.isCompleted = true;
  const issued = await issueCertificate({
    studentId: 'stu-2',
    courseId: 'course-1',
    enrollmentId: created.enrollment.id,
    certificateNumber: 'CB-0002',
  });
  assert.ok('certificate' in issued);
  assert.match(issued.certificate.verificationToken, /^[0-9a-f]{32}$/);
  const again = await issueCertificate({
    studentId: 'stu-2',
    courseId: 'course-1',
    enrollmentId: created.enrollment.id,
    certificateNumber: 'CB-0003',
  });
  assert.ok('error' in again);
});

test('coupons: expired coupons are rejected; active ones validate', async () => {
  const ok = await validateCoupon('welcome10');
  assert.ok(ok);
  assert.equal(ok.code, 'WELCOME10');
  assert.equal(await validateCoupon('OLD'), null);
  assert.equal(await validateCoupon('NOPE'), null);
});

test('announcements, reviews, blog and testimonials read back', async () => {
  const siteWide = await getSiteWideAnnouncements();
  assert.deepEqual(siteWide.map((a) => a.id), ['ann-1']);
  assert.equal(siteWide[0].type, 'site-wide');
  const courseAnn = await getCourseAnnouncements('course-1');
  assert.deepEqual(courseAnn.map((a) => a.id), ['ann-2']);

  assert.equal((await getReviewsByCourse('course-1')).length, 1);

  const posts = await getPublishedPosts();
  assert.deepEqual(posts.map((p) => p.slug), ['hello']);
  assert.equal((await getPostBySlug('hello'))?.title, 'Hello');
  assert.equal(await getPostBySlug('missing'), null);

  assert.equal((await listTestimonials()).length, 1);
});
