/**
 * Security Group A regression tests — CodeBettle security remediation.
 *
 * One test per finding, proving the attack is blocked AND legitimate use
 * still works. Runs on the fake db + direct route-handler invocation.
 * Findings covered: INST-01, ADM-03, NEW-1, NEW-3, STU-03, STU-05,
 * INST-03, INST-04, ADM-02, NEW-13.
 * (STU-02's 404 change is covered in tests/certificate-download.test.ts.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import { loadCourseForEdit, updateCourseService } from '../lib/services/course-service';
import { instructorCourseUpdateSchema } from '../lib/api-schemas';
import { issueCertificate } from '../lib/db/certificates';
import { getIntegritySummary } from '../lib/services/data-integrity-service';
import { updateEnrollmentService } from '../lib/services/enrollment-service';
import {
  createQuizForTeacher,
  listAvailableQuizzes,
  publishQuiz,
  saveQuizQuestions,
  startAttempt,
  type QuestionInput,
} from '../lib/services/quiz-service';
import {
  approveReviewService,
  createReviewService,
} from '../lib/services/review-service';
import { getApprovedPublicReviewsByCourse } from '../lib/db/reviews';
import { mintViewAsToken, verifyViewAsToken, VIEW_AS_TTL_MS } from '../lib/view-as';
import { startViewAs } from '../lib/services/recruitment-service';
import nextConfig from '../next.config';
import { PATCH as patchInstructorCourse } from '../app/api/instructor/courses/[id]/route';
import { PATCH as patchInstructorLesson } from '../app/api/instructor/courses/[id]/modules/[moduleId]/lessons/[lessonId]/route';
import { POST as postInstructorAnnouncement } from '../app/api/instructor/announcements/route';
import { PATCH as patchInstructorEnrollment } from '../app/api/instructor/enrollments/[id]/route';
import type { Actor } from '../lib/services/errors';
import type { SessionUser } from '../lib/services/auth-service';

const D = (s: string) => new Date(s);
const T0 = D('2026-01-10T10:00:00.000Z');

const ADMIN: Actor = { id: 'admin-1', role: 'admin', name: 'Admin' };
const INST1: Actor = { id: 'inst-1', role: 'instructor', name: 'Usman' };
const INST2: Actor = { id: 'inst-2', role: 'instructor', name: 'Fatima' };
const STU_PAID: Actor = { id: 'stu-paid', role: 'student', name: 'Paid Student' };
const STU_PENDING: Actor = { id: 'stu-pending', role: 'student', name: 'Pending Student' };
const STU_FREE: Actor = { id: 'stu-free', role: 'student', name: 'Free Student' };

const ADMIN_SESSION: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };
const INST1_SESSION: SessionUser = { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', role: 'instructor' };
const INST2_SESSION: SessionUser = { id: 'inst-2', name: 'Fatima', email: 'fatima@codebettle.com', role: 'instructor' };

// Opaque instructor-portal keys (48 hex) for the seeded courses. Instructor
// routes resolve the URL param as a urlKey only — a raw course id 404s.
const KEY1 = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6';
const KEY2 = 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1';

let fake: FakeDb;

function course(id: string, instructorId: string, isFree = false, urlKey: string | null = null) {
  return {
    id, slug: id, title: id, description: 'Intro', longDescription: 'Long',
    thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree,
    instructorId, zoomLink: 'https://zoom.example.com/1', schedule: null, status: 'published',
    isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
    tags: [], enrolledCount: 0, rating: 0, reviewCount: 0, urlKey,
    createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
  };
}

function seedBase() {
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-2', name: 'Fatima', email: 'fatima@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-paid', name: 'Paid Student', email: 'paid@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-pending', name: 'Pending Student', email: 'pending@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-free', name: 'Free Student', email: 'free@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('Course', [course('course-1', 'inst-1', false, KEY1), course('course-2', 'inst-2', false, KEY2)]);
  fake.seed('Enrollment', [
    { id: 'enr-paid', studentId: 'stu-paid', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: true, completedAt: D('2024-06-01'), paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
    { id: 'enr-pending', studentId: 'stu-pending', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: true, completedAt: D('2024-06-01'), paymentStatus: 'pending', amountPaid: 0, couponUsed: null, deletedAt: null },
    { id: 'enr-free', studentId: 'stu-free', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: true, completedAt: D('2024-06-01'), paymentStatus: 'free', amountPaid: 0, couponUsed: null, deletedAt: null },
    { id: 'enr-pending-c2', studentId: 'stu-pending', courseId: 'course-2', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'pending', amountPaid: 0, couponUsed: null, deletedAt: null },
    { id: 'enr-paid-c2', studentId: 'stu-paid', courseId: 'course-2', enrolledAt: D('2024-05-01'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
  ]);
}

const ONE_QUESTION: QuestionInput[] = [
  {
    type: 'mcq', prompt: 'What is 2 + 2?', points: 2, explanation: '2 + 2 is 4.',
    options: [
      { text: '3', isCorrect: false },
      { text: '4', isCorrect: true },
      { text: '5', isCorrect: false },
    ],
  },
];

async function makePublishedQuiz(actor: Actor, courseId: string, title: string) {
  const created = await createQuizForTeacher(actor, { courseId, title, timeLimitMin: 30, attemptsAllowed: 1, passMark: 50 });
  assert.ok('quiz' in created, JSON.stringify(created));
  const saved = await saveQuizQuestions(actor, created.quiz.id, ONE_QUESTION);
  assert.ok('quiz' in saved, JSON.stringify(saved));
  const published = await publishQuiz(actor, created.quiz.id);
  assert.ok('quiz' in published, JSON.stringify(published));
  return published.quiz;
}

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  seedBase();
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

// ─── INST-01 — instructor course page ownership ─────────────────────────────
// The instructor course-manage page gates on loadCourseForEdit (the same
// ownership rule as the write endpoints) and maps ANY error to notFound(),
// so a missing course and a course the instructor does not own are
// indistinguishable (404) on the page — instructor B cannot open
// instructor A's course page (Zoom link + recording URLs). The helper
// itself reports 403 for a non-owner; the page converts that to 404.

test('INST-01: another instructor cannot load a course they do not teach (403 from the gate, 404 on the page); owner and admin can', async () => {
  const other = await loadCourseForEdit(INST2, 'course-1');
  assert.ok('error' in other && other.status === 403, JSON.stringify(other));
  const owner = await loadCourseForEdit(INST1, 'course-1');
  assert.ok('course' in owner, JSON.stringify(owner));
  assert.equal(owner.course.id, 'course-1');
  const admin = await loadCourseForEdit(ADMIN, 'course-1');
  assert.ok('course' in admin, JSON.stringify(admin));
  const missing = await loadCourseForEdit(INST1, 'no-such-course');
  assert.ok('error' in missing && missing.status === 404, JSON.stringify(missing));
});

// ─── ADM-03 — instructor cannot set certificateTemplateHtml ────────────────
// The instructor-accepted schema drops the field at the boundary, and the
// service strips it for teacher-only actors, so a crafted PATCH cannot
// plant a template (which would render via headless Chromium at PDF time).
// Admins can still set the field (their template editor is the only UI).

test('ADM-03: instructor PATCH with certificateTemplateHtml leaves the template unchanged; admin PATCH sets it', async () => {
  const before = await updateCourseService(INST1, 'course-1', { title: 'Renamed' });
  assert.ok('course' in before, JSON.stringify(before));
  assert.equal(before.course.certificateTemplateHtml, null);

  const planted = await updateCourseService(INST1, 'course-1', {
    certificateTemplateHtml: '<script>alert(1)</script>',
  });
  assert.ok('course' in planted, JSON.stringify(planted));
  assert.equal(planted.course.certificateTemplateHtml, null, 'instructor must not be able to set the template');

  const adminSet = await updateCourseService(ADMIN, 'course-1', {
    certificateTemplateHtml: '<div>Admin template</div>',
  });
  assert.ok('course' in adminSet, JSON.stringify(adminSet));
  assert.equal(adminSet.course.certificateTemplateHtml, '<div>Admin template</div>');
});

test('ADM-03: the instructor schema drops certificateTemplateHtml at the boundary', () => {
  const parsed = instructorCourseUpdateSchema.parse({ certificateTemplateHtml: '<script>x</script>' });
  assert.equal('certificateTemplateHtml' in parsed, false, 'field must not survive instructor validation');
});

// ─── NEW-1 — certificate issuance requires verified payment ────────────────

test('NEW-1: issuing a certificate for a pending-payment enrolment is refused; paid and free enrolments still issue', async () => {
  const refused = await issueCertificate({ studentId: 'stu-pending', courseId: 'course-1', enrollmentId: 'enr-pending', certificateNumber: 'CB-2026-901' });
  assert.ok('error' in refused, JSON.stringify(refused));
  assert.match(refused.error, /payment/i);

  const paid = await issueCertificate({ studentId: 'stu-paid', courseId: 'course-1', enrollmentId: 'enr-paid', certificateNumber: 'CB-2026-902' });
  assert.ok('certificate' in paid, JSON.stringify(paid));

  const free = await issueCertificate({ studentId: 'stu-free', courseId: 'course-1', enrollmentId: 'enr-free', certificateNumber: 'CB-2026-903' });
  assert.ok('certificate' in free, JSON.stringify(free));
});

test('NEW-1: marking a pending-payment enrolment complete does not auto-issue a certificate; a paid one does', async () => {
  // enr-pending-c2 is incomplete + pending; enr-paid-c2 is incomplete + paid.
  const pending = await updateEnrollmentService(ADMIN, 'enr-pending-c2', { isCompleted: true, certificateEligible: true });
  assert.ok('enrollment' in pending, JSON.stringify(pending));
  assert.equal(pending.certificate, null, 'no certificate may auto-issue for unpaid enrolment');

  const paid = await updateEnrollmentService(ADMIN, 'enr-paid-c2', { isCompleted: true, certificateEligible: true });
  assert.ok('enrollment' in paid, JSON.stringify(paid));
  assert.ok(paid.certificate !== null, 'paid enrolment still auto-issues');
});

test('NEW-1: the data-integrity summary flags certificates on unpaid enrolments', async () => {
  const clean = await getIntegritySummary();
  assert.equal(clean.certificatesForUnpaidEnrolments.count, 0);
  fake.seed('Certificate', [
    { id: 'cert-bad', studentId: 'stu-pending', courseId: 'course-1', enrollmentId: 'enr-pending', certificateNumber: 'CB-2026-999', verificationToken: 'tok', issuedAt: D('2024-06-02') },
  ]);
  const flagged = await getIntegritySummary();
  assert.equal(flagged.certificatesForUnpaidEnrolments.count, 1);
  assert.deepEqual(flagged.certificatesForUnpaidEnrolments.exampleIds, ['cert-bad']);
});

// ─── NEW-3 — quizzes require verified payment ───────────────────────────────

test('NEW-3: a pending-payment student sees no quizzes and cannot start one; a paid student can', async () => {
  const quiz = await makePublishedQuiz(INST1, 'course-1', 'Week 1 Quiz');
  const pendingList = await listAvailableQuizzes(STU_PENDING);
  assert.ok('quizzes' in pendingList, JSON.stringify(pendingList));
  assert.equal(pendingList.quizzes.length, 0, 'pending student must not see the quiz');

  const pendingStart = await startAttempt(STU_PENDING, quiz.id, T0);
  assert.ok('error' in pendingStart && pendingStart.status === 403, JSON.stringify(pendingStart));
  assert.match(pendingStart.error, /payment/i);

  const paidList = await listAvailableQuizzes(STU_PAID);
  assert.ok('quizzes' in paidList, JSON.stringify(paidList));
  assert.equal(paidList.quizzes.length, 1);

  const paidStart = await startAttempt(STU_PAID, quiz.id, T0);
  assert.ok('attempt' in paidStart, JSON.stringify(paidStart));
});

// ─── STU-03 — reviews require verified payment ─────────────────────────────

test('STU-03: a pending-payment student cannot post a review; paid and free students can', async () => {
  const refused = await createReviewService(STU_PENDING, { courseId: 'course-1', rating: 5, comment: 'Great' });
  assert.ok('error' in refused && refused.status === 403, JSON.stringify(refused));
  assert.match(refused.error, /payment/i);

  const paid = await createReviewService(STU_PAID, { courseId: 'course-1', rating: 5, comment: 'Great' });
  assert.ok('review' in paid, JSON.stringify(paid));
  assert.equal(paid.review.status, 'pending');

  const free = await createReviewService(STU_FREE, { courseId: 'course-1', rating: 4, comment: 'Good' });
  assert.ok('review' in free, JSON.stringify(free));
});

// ─── STU-05 — public review payload hides studentId ────────────────────────

test('STU-05: the public approved-reviews payload has no studentId and shows the author name', async () => {
  const created = await createReviewService(STU_PAID, { courseId: 'course-1', rating: 5, title: 'Excellent', comment: 'Loved it' });
  assert.ok('review' in created, JSON.stringify(created));
  const approved = await approveReviewService(ADMIN, created.review.id);
  assert.ok('review' in approved, JSON.stringify(approved));

  const pub = await getApprovedPublicReviewsByCourse('course-1');
  assert.equal(pub.length, 1);
  assert.equal('studentId' in pub[0], false, 'public payload must not expose studentId');
  assert.equal(pub[0].studentName, 'Paid Student');
  assert.equal(pub[0].rating, 5);
});

// ─── NEW-13 — flag-admins can moderate reviews ─────────────────────────────

test('NEW-13: a flag-admin (isAdmin with a non-admin primary role) can moderate reviews; a student cannot', async () => {
  const created = await createReviewService(STU_PAID, { courseId: 'course-1', rating: 5, comment: 'Great' });
  assert.ok('review' in created, JSON.stringify(created));
  const flagAdmin: Actor = { id: 'flag-1', role: 'instructor', name: 'Flag Admin', isAdmin: true, isTeacher: true };
  const moderated = await approveReviewService(flagAdmin, created.review.id);
  assert.ok('review' in moderated, JSON.stringify(moderated));
  assert.equal(moderated.review.status, 'approved');

  const created2 = await createReviewService(STU_FREE, { courseId: 'course-1', rating: 4, comment: 'Good' });
  assert.ok('review' in created2, JSON.stringify(created2));
  const studentTry = await approveReviewService(STU_FREE, created2.review.id);
  assert.ok('error' in studentTry && studentTry.status === 403, JSON.stringify(studentTry));
});

// ─── INST-03 — ownership check runs BEFORE body validation ─────────────────
// Each route must 403 a non-owner even with a body that would fail
// validation (empty/missing fields), so behaviour is not leaked first.

test('INST-03: PATCH another instructor\'s course with an empty body is 403 (not 400); the owner still gets 400', async () => {
  __setTestSession(INST2_SESSION);
  const other = await patchInstructorCourse(jsonReq(`http://localhost/api/instructor/courses/${KEY1}`, 'PATCH', {}), { params: Promise.resolve({ id: KEY1 }) });
  assert.equal(other.status, 403, await other.text());

  __setTestSession(INST1_SESSION);
  const ownerEmpty = await patchInstructorCourse(jsonReq(`http://localhost/api/instructor/courses/${KEY1}`, 'PATCH', {}), { params: Promise.resolve({ id: KEY1 }) });
  assert.equal(ownerEmpty.status, 400, await ownerEmpty.text());

  const ownerOk = await patchInstructorCourse(jsonReq(`http://localhost/api/instructor/courses/${KEY1}`, 'PATCH', { title: 'Renamed by owner' }), { params: Promise.resolve({ id: KEY1 }) });
  assert.equal(ownerOk.status, 200, await ownerOk.text());
});

test('INST-03: PATCH another instructor\'s lesson with an invalid body is 403', async () => {
  __setTestSession(INST2_SESSION);
  const res = await patchInstructorLesson(
    jsonReq(`http://localhost/api/instructor/courses/${KEY1}/modules/m1/lessons/l1`, 'PATCH', {}),
    { params: Promise.resolve({ id: KEY1, moduleId: 'm1', lessonId: 'l1' }) },
  );
  assert.equal(res.status, 403, await res.text());
});

test('INST-03: POST an announcement for another instructor\'s course with missing fields is 403; the owner still posts', async () => {
  __setTestSession(INST2_SESSION);
  const other = await postInstructorAnnouncement(jsonReq('http://localhost/api/instructor/announcements', 'POST', { courseId: KEY1 }));
  assert.equal(other.status, 403, await other.text());

  __setTestSession(INST1_SESSION);
  const owner = await postInstructorAnnouncement(jsonReq('http://localhost/api/instructor/announcements', 'POST', { courseId: KEY1, title: 'Hello', content: 'Welcome' }));
  assert.equal(owner.status, 201, await owner.text());
});

test('INST-03: PATCH another instructor\'s enrolment with an invalid body is 403; the owner still updates', async () => {
  __setTestSession(INST2_SESSION);
  const other = await patchInstructorEnrollment(jsonReq('http://localhost/api/instructor/enrollments/enr-paid', 'PATCH', {}), { params: Promise.resolve({ id: 'enr-paid' }) });
  assert.equal(other.status, 403, await other.text());

  __setTestSession(INST1_SESSION);
  const owner = await patchInstructorEnrollment(jsonReq('http://localhost/api/instructor/enrollments/enr-paid', 'PATCH', { certificateEligible: true }), { params: Promise.resolve({ id: 'enr-paid' }) });
  assert.equal(owner.status, 200, await owner.text());
});

// ─── INST-04 — X-Powered-By header ─────────────────────────────────────────

test('INST-04: poweredByHeader is off, so Next.js does not send X-Powered-By', () => {
  assert.equal(nextConfig.poweredByHeader, false);
});

// ─── ADM-02 — view-as tokens expire after 30 minutes ───────────────────────

test('ADM-02: minted view-as tokens carry a 30-minute expiry and are rejected after it', () => {
  assert.equal(VIEW_AS_TTL_MS, 30 * 60 * 1000);
  const now = 1_000_000;
  const minted = mintViewAsToken('admin-1', 'inst-1', undefined, now);
  assert.equal(minted.expiresAt, now + VIEW_AS_TTL_MS);

  const before = verifyViewAsToken(minted.token, now + VIEW_AS_TTL_MS - 1);
  assert.ok(before !== null, 'token must still verify inside its TTL');

  const after = verifyViewAsToken(minted.token, now + VIEW_AS_TTL_MS);
  assert.equal(after, null, 'token must be rejected at/after its TTL');
});

test('ADM-02: startViewAs returns a real numeric expiry within the TTL', async () => {
  const before = Date.now();
  const result = await startViewAs(ADMIN, 'inst-1');
  assert.ok(!('error' in result), JSON.stringify(result));
  assert.equal(typeof result.expiresAt, 'number');
  assert.ok(result.expiresAt >= before + VIEW_AS_TTL_MS - 1000, 'expiry must be ~30 minutes from minting');
  assert.ok(result.expiresAt <= Date.now() + VIEW_AS_TTL_MS, 'expiry must not exceed the TTL');
});
