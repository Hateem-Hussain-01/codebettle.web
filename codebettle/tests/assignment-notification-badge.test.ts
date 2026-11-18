/**
 * Assignments notification badge (Eman, 15 Nov 2026).
 *
 * The student sidebar's Assignments item carries a small gold bubble
 * with the count of the student's VISIBLE assignments they have NOT
 * submitted yet — a new assignment raises it, submitting one lowers
 * it. No "seen" tracking, no new DB field. The count reuses the
 * exact visibility rule of GET /api/student/assignments (batch-scoped
 * assignments show only to students enrolled in that batch;
 * course-wide assignments show to every enrolled student), and the
 * bubble sits inline at the right end of the nav row (gold pill,
 * dark text, "9+" cap), like the approved preview.
 *
 * The counting helper runs against the fake DB; the render wiring
 * (server component + client sidebar) is asserted by source
 * inspection, following the Phase 6 design-test pattern
 * (tests/phase6-design.test.ts).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { __resetDbClient, __setDbClient, type DbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  countUnsubmittedVisibleAssignments,
  createAssignment,
  createSubmission,
  gradeSubmission,
} from '../lib/db/assignments';

const D = (s: string) => new Date(s);
const COLAB = 'https://colab.research.google.com/drive/1AbC2dEf3GhI4jKl5MnOp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const collapsibleSidebar = read('components/layout/CollapsibleSidebar.tsx');
const studentLayout = read('app/student/layout.tsx');
const instructorLayout = read('app/instructor/layout.tsx');
const adminLayout = read('app/admin/layout.tsx');

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
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('User', [
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-2', name: 'Bilal', email: 'bilal@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-3', name: 'Noor', email: 'noor@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('Batch', [
    { id: 'batch-8', courseId: 'course-1', batchNumber: 8, status: 'ongoing', startDate: D('2026-10-01'), endDate: null, capacity: 30, instructorId: 'inst-1', createdAt: D('2026-09-01'), updatedAt: D('2026-09-01') },
    { id: 'batch-9', courseId: 'course-1', batchNumber: 9, status: 'upcoming', startDate: D('2026-11-01'), endDate: null, capacity: 30, instructorId: 'inst-1', createdAt: D('2026-09-01'), updatedAt: D('2026-09-01') },
  ]);
  // stu-1: course-1 Batch 09 + course-2 (no batch). stu-2: course-1
  // Batch 08. stu-3: no enrolments at all.
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', batchId: 'batch-9', enrolledAt: D('2026-10-02'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 1500, couponUsed: null, deletedAt: null },
    { id: 'enr-2', studentId: 'stu-1', courseId: 'course-2', batchId: null, enrolledAt: D('2026-10-02'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
    { id: 'enr-3', studentId: 'stu-2', courseId: 'course-1', batchId: 'batch-8', enrolledAt: D('2026-10-02'), isCompleted: false, completedAt: null, paymentStatus: 'paid', amountPaid: 1500, couponUsed: null, deletedAt: null },
  ]);
}

async function seedAssignments() {
  const a1 = await createAssignment({
    courseId: 'course-1', batchId: 'batch-9', title: 'Batch 9 work',
    description: 'Only Batch 09 sees this.', dueDate: '2026-12-01T23:59:00.000Z', maxMarks: 100, createdBy: 'inst-1',
  });
  const a2 = await createAssignment({
    courseId: 'course-1', batchId: 'batch-8', title: 'Batch 8 work',
    description: 'Only Batch 08 sees this.', dueDate: '2026-12-01T23:59:00.000Z', maxMarks: 100, createdBy: 'inst-1',
  });
  const a3 = await createAssignment({
    courseId: 'course-1', batchId: null, title: 'Course-wide Python',
    description: 'Every Python student sees this.', dueDate: '2026-12-01T23:59:00.000Z', maxMarks: 50, createdBy: 'inst-1',
  });
  const a4 = await createAssignment({
    courseId: 'course-2', batchId: null, title: 'Course-wide Web',
    description: 'Every Web student sees this.', dueDate: '2026-12-01T23:59:00.000Z', maxMarks: 50, createdBy: 'inst-1',
  });
  return { a1, a2, a3, a4 };
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  seedBase();
});

test.afterEach(() => {
  __resetDbClient();
});

// ---------------------------------------------------------------------------
// 1. Count: only visible + unsubmitted assignments
// ---------------------------------------------------------------------------

test('count counts only visible unsubmitted assignments (batch scope respected)', async () => {
  const { a1, a2, a3, a4 } = await seedAssignments();
  // stu-1 (Batch 09 + Web): sees A1, A3, A4 — NOT the Batch-08 A2.
  assert.equal(await countUnsubmittedVisibleAssignments('stu-1'), 3);
  // stu-2 (Batch 08): sees A2, A3 — NOT the Batch-09 A1.
  assert.equal(await countUnsubmittedVisibleAssignments('stu-2'), 2);
  void a1;
  void a2;
  void a3;
  void a4;
});

test('count excludes submitted assignments (graded or not)', async () => {
  const { a1, a3, a4 } = await seedAssignments();
  // stu-1 submits the course-wide A3 and the Web A4, then A4 is graded.
  const sub3 = await createSubmission({ assignmentId: a3.id, studentId: 'stu-1', colabUrl: COLAB, status: 'submitted' });
  const sub4 = await createSubmission({ assignmentId: a4.id, studentId: 'stu-1', colabUrl: COLAB, status: 'submitted' });
  await gradeSubmission(sub4.id, { marks: 40, feedback: 'Good work.', gradedBy: 'inst-1' });
  void sub3;
  // Only the unsubmitted Batch-09 assignment A1 is left.
  assert.equal(await countUnsubmittedVisibleAssignments('stu-1'), 1);
  // stu-2 never submitted anything: A2 + A3 still count.
  assert.equal(await countUnsubmittedVisibleAssignments('stu-2'), 2);
  void a1;
});

test('count is 0 when everything visible is submitted', async () => {
  const { a1, a3, a4 } = await seedAssignments();
  for (const a of [a1, a3, a4]) {
    await createSubmission({ assignmentId: a.id, studentId: 'stu-1', colabUrl: COLAB, status: 'submitted' });
  }
  assert.equal(await countUnsubmittedVisibleAssignments('stu-1'), 0);
});

test('count is 0 for a student with no enrolments', async () => {
  await seedAssignments();
  assert.equal(await countUnsubmittedVisibleAssignments('stu-3'), 0);
});

test('count is 0 when the assignment tables are not ready (migration not run)', async () => {
  // The readiness probe throws the missing-table error (42P01) when
  // the migration has not run — the count must fail safe to 0.
  const missing = new Error('relation "public"."Assignment" does not exist') as Error & { code?: string };
  missing.code = '42P01';
  const stub = {
    orm: {
      public: {
        Assignment: {
          orderBy: () => ({ limit: () => ({ all: async () => { throw missing; } }) }),
        },
      },
    },
  } as unknown as DbClient;
  __setDbClient(stub);
  assert.equal(await countUnsubmittedVisibleAssignments('stu-1'), 0);
});

// ---------------------------------------------------------------------------
// 2. Render: gold pill at the right end of the nav row, "9+" cap
// ---------------------------------------------------------------------------

// The badge renders in CollapsibleSidebar (Eman, 18 Nov 2026 — the
// sidebar was extracted from PortalLayout into its own component;
// PortalLayout only forwards the navItems). The pill contract is
// unchanged: gold pill, dark text, "9+" cap, right end of the row.
test('CollapsibleSidebar NavItem carries an optional badge and renders the pill only when > 0', () => {
  assert.ok(
    collapsibleSidebar.includes('badge?: number'),
    'NavItem must have an optional badge field',
  );
  // Rendered at the right end of the row, gold pill + dark text (same
  // as the top-bar NotificationBadge), capped at "9+".
  assert.ok(collapsibleSidebar.includes("item.badge > 0"), 'pill must render only when the count is above 0');
  assert.ok(collapsibleSidebar.includes("item.badge > 9 ? '9+' : item.badge"), 'counts of 10+ must cap at "9+"');
  assert.ok(
    collapsibleSidebar.includes('bg-primary text-ink text-[11px] font-bold rounded-full'),
    'pill must use the gold-pill + dark-text style',
  );
  // The pill and the active chevron sit side by side at the right end
  // (one ml-auto group), never two competing ml-auto elements.
  assert.ok(
    collapsibleSidebar.includes('ml-auto flex items-center gap-1.5'),
    'badge + chevron must share one right-aligned group',
  );
  assert.ok(
    !collapsibleSidebar.includes('<ChevronRight className="w-4 h-4 ml-auto'),
    'the chevron must no longer carry its own ml-auto',
  );
  // Collapsed rail: the count becomes a dot on the icon (video
  // pattern) instead of disappearing with the label.
  assert.ok(
    collapsibleSidebar.includes('rounded-full bg-primary ring-2 ring-dark-card'),
    'collapsed rail must show the badge as a dot on the icon',
  );
});

test('student layout computes the badge server-side and passes it only to Assignments', () => {
  assert.ok(
    studentLayout.includes('countUnsubmittedVisibleAssignments(session.id)'),
    'the student layout must compute the unsubmitted count for the logged-in student',
  );
  assert.ok(
    studentLayout.includes("item.href === '/student/assignments'"),
    'the badge must be attached to the Assignments item only',
  );
  // Fail-safe: a throwing count query renders the layout WITHOUT a
  // badge instead of breaking the sidebar.
  assert.ok(
    studentLayout.includes('} catch {') && studentLayout.includes('assignmentBadge = undefined'),
    'a failed count must fall back to no badge',
  );
  assert.ok(
    studentLayout.includes('if (unsubmitted > 0) assignmentBadge = unsubmitted'),
    'a zero count must produce no badge',
  );
});

test('instructor and admin layouts pass no badge (unchanged)', () => {
  assert.ok(!instructorLayout.includes('badge'), 'instructor nav must not carry a badge');
  assert.ok(!adminLayout.includes('badge'), 'admin nav must not carry a badge');
});
