import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  COLAB_HOST,
  computeSubmissionStatus,
  isLateSubmission,
  isValidColabUrl,
  validateAssignment,
  validateColabUrl,
  validateGrade,
} from '../lib/assignments';
import {
  createAssignment,
  createSubmission,
  deleteAssignment,
  getSubmissionByAssignmentAndStudent,
  gradeSubmission,
  listAssignmentsEnriched,
  listSubmissionsEnriched,
  updateSubmission,
} from '../lib/db/assignments';
import { ADMIN_AREAS } from '../lib/admin-access';
import { POST as studentSubmit } from '../app/api/student/assignments/[id]/submit/route';
import { PATCH as gradeRoute } from '../app/api/instructor/submissions/[id]/grade/route';
import { POST as instructorCreate } from '../app/api/instructor/assignments/route';
import type { SessionUser } from '../lib/services/auth-service';

/**
 * Assignments & Grading.
 *
 * A submission is a Google Colab LINK only — the student pastes the
 * notebook URL, no file is ever uploaded, so this feature uses
 * (nearly) no storage. Server-side validation accepts ONLY
 * https://colab.research.google.com URLs.
 */

const D = (s: string) => new Date(s);
const COLAB = 'https://colab.research.google.com/drive/1AbC2dEf3GhI4jKl5MnOp';

const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin', isAdmin: true };
const INST1: SessionUser = { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', role: 'instructor', isTeacher: true };
const INST2: SessionUser = { id: 'inst-2', name: 'Sara', email: 'sara@codebettle.com', role: 'instructor', isTeacher: true };
const STU1: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };
const STU2: SessionUser = { id: 'stu-2', name: 'Bilal', email: 'bilal@example.com', role: 'student' };

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
    {
      id: 'course-2', slug: 'web', title: 'Web Dev', description: 'Intro', longDescription: '',
      thumbnail: '/t.png', category: 'Programming', level: 'beginner', pricePkr: 5000, isFree: false,
      instructorId: 'inst-2', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('User', [
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-2', name: 'Sara', email: 'sara@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-2', name: 'Bilal', email: 'bilal@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('Batch', [
    { id: 'batch-8', courseId: 'course-1', batchNumber: 8, status: 'ongoing', startDate: D('2026-10-01'), endDate: null, capacity: 30, instructorId: 'inst-1', createdAt: D('2026-09-01'), updatedAt: D('2026-09-01') },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', batchId: 'batch-8', enrolledAt: D('2026-10-02'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 1500, couponUsed: null, deletedAt: null },
  ]);
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

// ---------------------------------------------------------------------------
// Colab URL validation (the storage rule: link only, never a file)
// ---------------------------------------------------------------------------

test('COLAB_HOST is exactly colab.research.google.com', () => {
  assert.equal(COLAB_HOST, 'colab.research.google.com');
});

test('isValidColabUrl accepts a Colab drive link', () => {
  assert.equal(isValidColabUrl(COLAB), true);
});

test('isValidColabUrl accepts a Colab GitHub link', () => {
  assert.equal(
    isValidColabUrl('https://colab.research.google.com/github/user/repo/blob/main/notebook.ipynb'),
    true,
  );
});

test('isValidColabUrl rejects http (not https)', () => {
  assert.equal(isValidColabUrl('http://colab.research.google.com/drive/abc'), false);
});

test('isValidColabUrl rejects other hosts, including lookalikes', () => {
  assert.equal(isValidColabUrl('https://drive.google.com/file/d/abc'), false);
  assert.equal(isValidColabUrl('https://example.com/notebook.ipynb'), false);
  // Suffix attack: the host must be EXACTLY colab.research.google.com.
  assert.equal(isValidColabUrl('https://colab.research.google.com.evil.com/drive/abc'), false);
  assert.equal(isValidColabUrl('https://notcolab.research.google.com/drive/abc'), false);
});

test('isValidColabUrl rejects non-URLs and empty input', () => {
  assert.equal(isValidColabUrl('not a url'), false);
  assert.equal(isValidColabUrl(''), false);
  assert.equal(isValidColabUrl('colab.research.google.com/drive/abc'), false);
});

test('validateColabUrl returns the Colab-only message for anything else', () => {
  assert.equal(validateColabUrl('https://drive.google.com/file/d/abc'), 'Please paste a Google Colab link (colab.research.google.com).');
  assert.equal(validateColabUrl(''), 'Please paste a Google Colab link.');
  assert.equal(validateColabUrl(COLAB), null);
});

// ---------------------------------------------------------------------------
// Assignment + grade validation
// ---------------------------------------------------------------------------

test('validateAssignment requires title, description, course and a sane maxMarks', () => {
  const base = { title: 'Build a classifier', description: 'Train a model.', courseId: 'course-1', maxMarks: 100 };
  assert.equal(validateAssignment(base), null);
  assert.equal(validateAssignment({ ...base, title: '  ' }), 'Title is required.');
  assert.equal(validateAssignment({ ...base, description: '' }), 'Description is required.');
  assert.equal(validateAssignment({ ...base, courseId: '' }), 'Course is required.');
  assert.equal(validateAssignment({ ...base, maxMarks: 0 }), 'Max marks must be a whole number greater than 0.');
  assert.equal(validateAssignment({ ...base, maxMarks: 1001 }), 'Max marks must be 1000 or fewer.');
  assert.equal(validateAssignment({ ...base, maxMarks: 12.5 }), 'Max marks must be a whole number greater than 0.');
  assert.equal(validateAssignment({ ...base, dueDate: 'not-a-date' }), 'Due date is not a valid date.');
  assert.equal(validateAssignment({ ...base, dueDate: '2026-12-01T10:00:00Z' }), null);
});

test('validateGrade bounds marks to 0..maxMarks, whole numbers only', () => {
  assert.equal(validateGrade(85, 100), null);
  assert.equal(validateGrade(0, 100), null);
  assert.equal(validateGrade(100, 100), null);
  assert.equal(validateGrade(-1, 100), 'Marks cannot be negative.');
  assert.equal(validateGrade(101, 100), 'Marks cannot be more than the max marks (100).');
  assert.equal(validateGrade(12.5, 100), 'Marks must be a whole number.');
  assert.equal(validateGrade(Number.NaN, 100), 'Marks must be a whole number.');
});

// ---------------------------------------------------------------------------
// Late status
// ---------------------------------------------------------------------------

test('isLateSubmission / computeSubmissionStatus: after the due date is late', () => {
  const due = '2026-11-01T10:00:00.000Z';
  assert.equal(isLateSubmission('2026-11-01T10:00:00.000Z', due), false); // exactly on time
  assert.equal(isLateSubmission('2026-11-01T10:00:01.000Z', due), true);
  assert.equal(isLateSubmission('2026-10-31T23:59:59.000Z', due), false);
  assert.equal(isLateSubmission('2027-01-01T00:00:00.000Z', null), false); // no due date: never late
  assert.equal(computeSubmissionStatus('2026-11-02T00:00:00.000Z', due), 'late');
  assert.equal(computeSubmissionStatus('2026-10-01T00:00:00.000Z', due), 'submitted');
});

// ---------------------------------------------------------------------------
// Repository flow (fake DB): create → submit → resubmit → grade → delete
// ---------------------------------------------------------------------------

test('repository: create assignment, submit, resubmit before grading, grade, delete removes submissions', async () => {
  const assignment = await createAssignment({
    courseId: 'course-1',
    batchId: 'batch-8',
    title: 'Spam classifier',
    description: 'Train a spam classifier in a notebook.',
    dueDate: '2026-12-01T23:59:00.000Z',
    maxMarks: 100,
    createdBy: 'inst-1',
  });
  assert.equal(assignment.title, 'Spam classifier');
  assert.equal(assignment.maxMarks, 100);

  const submission = await createSubmission({
    assignmentId: assignment.id,
    studentId: 'stu-1',
    colabUrl: COLAB,
    status: 'submitted',
  });
  assert.equal(submission.status, 'submitted');
  assert.equal(submission.marks, null);
  assert.equal(submission.colabUrl, COLAB);

  // One submission per student: the lookup finds the same row.
  const found = await getSubmissionByAssignmentAndStudent(assignment.id, 'stu-1');
  assert.equal(found?.id, submission.id);

  // Resubmit before grading: the link is updated, still one row.
  const resubmitted = await updateSubmission(submission.id, {
    colabUrl: 'https://colab.research.google.com/drive/NEWID123',
  });
  assert.ok(resubmitted);
  assert.equal(resubmitted.colabUrl, 'https://colab.research.google.com/drive/NEWID123');
  assert.equal(resubmitted.status, 'submitted');

  // Grade it.
  const graded = await gradeSubmission(submission.id, { marks: 85, feedback: 'Well done', gradedBy: 'inst-1' });
  assert.ok(graded);
  assert.equal(graded.status, 'graded');
  assert.equal(graded.marks, 85);
  assert.equal(graded.feedback, 'Well done');
  assert.equal(graded.gradedBy, 'inst-1');
  assert.ok(graded.gradedAt);

  // Enriched views: course title, batch label, creator, counts, grader name.
  const enriched = await listAssignmentsEnriched(['course-1']);
  assert.equal(enriched.length, 1);
  assert.equal(enriched[0].courseTitle, 'Python Crash Course');
  assert.equal(enriched[0].batchLabel, 'BATCH-8');
  assert.equal(enriched[0].creatorName, 'Usman');
  assert.equal(enriched[0].submissionCount, 1);
  assert.equal(enriched[0].gradedCount, 1);

  const subs = await listSubmissionsEnriched(assignment.id);
  assert.equal(subs.length, 1);
  assert.equal(subs[0].studentName, 'Ali');
  assert.equal(subs[0].graderName, 'Usman');
  assert.equal(subs[0].marks, 85);

  // Delete removes the assignment AND its submissions.
  await deleteAssignment(assignment.id);
  assert.equal((await listAssignmentsEnriched(['course-1'])).length, 0);
  assert.equal((await listSubmissionsEnriched(assignment.id)).length, 0);
});

test('repository: a submission after the due date is stored as late', async () => {
  const assignment = await createAssignment({
    courseId: 'course-1',
    title: 'Late one',
    description: 'Past due.',
    dueDate: '2026-01-01T00:00:00.000Z',
    maxMarks: 10,
    createdBy: 'inst-1',
  });
  const late = await createSubmission({
    assignmentId: assignment.id,
    studentId: 'stu-1',
    colabUrl: COLAB,
    status: computeSubmissionStatus(new Date().toISOString(), assignment.dueDate),
  });
  assert.equal(late.status, 'late');
});

// ---------------------------------------------------------------------------
// Route flow: student submit (enrolled only, Colab only, one per student,
// no resubmit after grading) and teacher grade
// ---------------------------------------------------------------------------

test('route: enrolled student submits a Colab link, resubmits, cannot resubmit after grading', async () => {
  const assignment = await createAssignment({
    courseId: 'course-1',
    title: 'Classifier',
    description: 'Build it.',
    dueDate: null,
    maxMarks: 100,
    createdBy: 'inst-1',
  });

  // Non-enrolled student cannot submit.
  __setTestSession(STU2);
  const forbidden = await studentSubmit(
    jsonReq('http://localhost/api/student/assignments/x/submit', 'POST', { colabUrl: COLAB }),
    { params: Promise.resolve({ id: assignment.id }) },
  );
  assert.equal(forbidden.status, 403);

  // Enrolled student, wrong URL: rejected with the Colab message.
  __setTestSession(STU1);
  const bad = await studentSubmit(
    jsonReq('http://localhost/api/student/assignments/x/submit', 'POST', { colabUrl: 'https://drive.google.com/file/d/abc' }),
    { params: Promise.resolve({ id: assignment.id }) },
  );
  assert.equal(bad.status, 400);
  assert.match((await bad.json() as { error: string }).error, /Google Colab link/);

  // Valid link: 201, one submission.
  const first = await studentSubmit(
    jsonReq('http://localhost/api/student/assignments/x/submit', 'POST', { colabUrl: COLAB }),
    { params: Promise.resolve({ id: assignment.id }) },
  );
  assert.equal(first.status, 201);
  assert.equal((await first.json() as { submission: { status: string } }).submission.status, 'submitted');
  assert.equal((await listSubmissionsEnriched(assignment.id)).length, 1);

  // Resubmit before grading: 200, still one submission, link updated.
  const second = await studentSubmit(
    jsonReq('http://localhost/api/student/assignments/x/submit', 'POST', { colabUrl: 'https://colab.research.google.com/drive/UPDATED' }),
    { params: Promise.resolve({ id: assignment.id }) },
  );
  assert.equal(second.status, 200);
  const afterResubmit = await listSubmissionsEnriched(assignment.id);
  assert.equal(afterResubmit.length, 1);
  assert.equal(afterResubmit[0].colabUrl, 'https://colab.research.google.com/drive/UPDATED');

  // Teacher grades with marks above max: 400.
  __setTestSession(INST1);
  const subId = afterResubmit[0].id;
  const tooHigh = await gradeRoute(
    jsonReq('http://localhost/api/instructor/submissions/x/grade', 'PATCH', { marks: 101, feedback: '' }),
    { params: Promise.resolve({ id: subId }) },
  );
  assert.equal(tooHigh.status, 400);

  // Valid grade: 200, graded.
  const graded = await gradeRoute(
    jsonReq('http://localhost/api/instructor/submissions/x/grade', 'PATCH', { marks: 90, feedback: 'Great work' }),
    { params: Promise.resolve({ id: subId }) },
  );
  assert.equal(graded.status, 200);
  assert.equal((await graded.json() as { submission: { status: string; marks: number } }).submission.status, 'graded');

  // Student cannot resubmit after grading.
  __setTestSession(STU1);
  const blocked = await studentSubmit(
    jsonReq('http://localhost/api/student/assignments/x/submit', 'POST', { colabUrl: COLAB }),
    { params: Promise.resolve({ id: assignment.id }) },
  );
  assert.equal(blocked.status, 400);
  assert.match((await blocked.json() as { error: string }).error, /already been graded/);
});

test('route: a submission after the due date is marked late', async () => {
  const assignment = await createAssignment({
    courseId: 'course-1',
    title: 'Past due',
    description: 'Due long ago.',
    dueDate: '2026-01-01T00:00:00.000Z',
    maxMarks: 10,
    createdBy: 'inst-1',
  });
  __setTestSession(STU1);
  const res = await studentSubmit(
    jsonReq('http://localhost/api/student/assignments/x/submit', 'POST', { colabUrl: COLAB }),
    { params: Promise.resolve({ id: assignment.id }) },
  );
  assert.equal(res.status, 201);
  assert.equal((await res.json() as { submission: { status: string } }).submission.status, 'late');
});

test('route: teacher cannot create an assignment for another teacher’s course', async () => {
  __setTestSession(INST1);
  const res = await instructorCreate(
    jsonReq('http://localhost/api/instructor/assignments', 'POST', {
      title: 'Not mine', description: 'Nope.', courseId: 'course-2', maxMarks: 50,
    }),
  );
  assert.equal(res.status, 403);
});

test('route: admin may create an assignment for any course', async () => {
  __setTestSession(ADMIN);
  const res = await instructorCreate(
    jsonReq('http://localhost/api/instructor/assignments', 'POST', {
      title: 'Admin set', description: 'By admin.', courseId: 'course-2', maxMarks: 50,
    }),
  );
  assert.equal(res.status, 201);
});

// ---------------------------------------------------------------------------
// Admin area registration
// ---------------------------------------------------------------------------

test('ADMIN_AREAS includes Assignments, right after Enrollments', () => {
  const keys = ADMIN_AREAS.map((a) => a.key);
  assert.ok(keys.includes('assignments'));
  assert.ok(keys.indexOf('assignments') === keys.indexOf('enrollments') + 1);
  const area = ADMIN_AREAS.find((a) => a.key === 'assignments');
  assert.equal(area?.href, '/admin/assignments');
});
