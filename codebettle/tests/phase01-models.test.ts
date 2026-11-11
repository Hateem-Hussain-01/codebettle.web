import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  createNote,
  deleteNoteForUser,
  getNoteForUser,
  listNotesForUser,
  updateNoteForUser,
} from '../lib/db/notes';
import {
  addToWishlist,
  isWishlisted,
  listWishlistCourseIdsForUser,
  listWishlistForUser,
  removeFromWishlist,
} from '../lib/db/wishlist';
import {
  createPaymentAccount,
  deletePaymentAccount,
  listActivePaymentAccounts,
  listPaymentAccounts,
  setPaymentAccountActive,
  updatePaymentAccount,
} from '../lib/db/payment-accounts';
import {
  approvePaymentSubmission,
  createPaymentSubmission,
  getPaymentSubmissionById,
  listPendingSubmissions,
  rejectPaymentSubmission,
  reviewPaymentSubmission,
} from '../lib/db/payments';
import { can } from '../lib/rbac';

const D = (s: string) => new Date(s);

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());

  fake.seed('User', [
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-2', name: 'Sara', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
  ]);
  fake.seed('Course', [
    { id: 'course-1', slug: 'web-101', title: 'Web 101', description: 'Intro', longDescription: null, thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false, instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published', isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [], tags: [], enrolledCount: 0, rating: 0, reviewCount: 0, createdAt: D('2024-04-01'), updatedAt: D('2024-04-01') },
    { id: 'course-2', slug: 'py-101', title: 'Python 101', description: 'Intro', longDescription: null, thumbnail: '/t.png', category: 'Programming', level: 'beginner', pricePkr: 3000, isFree: false, instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'published', isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [], tags: [], enrolledCount: 0, rating: 0, reviewCount: 0, createdAt: D('2024-04-01'), updatedAt: D('2024-04-01') },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-04-02'), completedAt: null, isCompleted: false, paymentStatus: 'pending', couponUsed: null, amountPaid: 0, certificateEligible: null, deletedAt: null, createdAt: D('2024-04-02'), updatedAt: D('2024-04-02') },
    { id: 'enr-2', studentId: 'stu-2', courseId: 'course-2', enrolledAt: D('2024-04-02'), completedAt: null, isCompleted: false, paymentStatus: 'pending', couponUsed: null, amountPaid: 0, certificateEligible: null, deletedAt: null, createdAt: D('2024-04-02'), updatedAt: D('2024-04-02') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
});

// ---------------------------------------------------------------------------
// Notes: user scoping
// ---------------------------------------------------------------------------

test('notes: user A cannot see, edit or delete user B notes', async () => {
  const note = await createNote({ userId: 'stu-1', title: 'Hooks', content: 'useState', courseId: 'course-1' });
  assert.equal(note.userId, 'stu-1');
  assert.equal(note.courseId, 'course-1');

  assert.deepEqual(await listNotesForUser('stu-1'), [note]);
  assert.deepEqual(await listNotesForUser('stu-2'), []);
  assert.equal(await getNoteForUser('stu-2', note.id), null);
  assert.equal(await updateNoteForUser('stu-2', note.id, { title: 'Hacked' }), null);
  assert.equal(await deleteNoteForUser('stu-2', note.id), false);

  // The owner's own update/delete still work, and the note is unchanged by the blocked attempts.
  const updated = await updateNoteForUser('stu-1', note.id, { title: 'Hooks v2' });
  assert.equal(updated?.title, 'Hooks v2');
  assert.equal(await deleteNoteForUser('stu-1', note.id), true);
  assert.deepEqual(await listNotesForUser('stu-1'), []);
});

test('notes: courseId is optional and can be unlinked', async () => {
  const note = await createNote({ userId: 'stu-1', title: 'General', content: 'no course' });
  assert.equal(note.courseId, undefined);
  const updated = await updateNoteForUser('stu-1', note.id, { courseId: null });
  assert.equal(updated?.courseId, undefined);
});

// ---------------------------------------------------------------------------
// Wishlist: duplicate prevention
// ---------------------------------------------------------------------------

test('wishlist: adding the same course twice creates one row', async () => {
  const first = await addToWishlist('stu-1', 'course-1');
  assert.equal(first.duplicate, false);
  const second = await addToWishlist('stu-1', 'course-1');
  assert.equal(second.duplicate, true);
  assert.equal(second.item.id, first.item.id);

  assert.deepEqual(await listWishlistForUser('stu-1'), [first.item]);
  assert.deepEqual(await listWishlistCourseIdsForUser('stu-1'), ['course-1']);
  assert.equal(await isWishlisted('stu-1', 'course-1'), true);
  assert.equal(await isWishlisted('stu-1', 'course-2'), false);
  // Another user may wishlist the same course independently.
  const other = await addToWishlist('stu-2', 'course-1');
  assert.equal(other.duplicate, false);
  assert.notEqual(other.item.id, first.item.id);
});

test('wishlist: remove works and is scoped per user', async () => {
  await addToWishlist('stu-1', 'course-1');
  await addToWishlist('stu-2', 'course-1');
  assert.equal(await removeFromWishlist('stu-1', 'course-2'), false);
  assert.equal(await removeFromWishlist('stu-1', 'course-1'), true);
  assert.equal(await removeFromWishlist('stu-1', 'course-1'), false);
  // The other user's row for the same course is untouched.
  assert.equal(await isWishlisted('stu-2', 'course-1'), true);
  assert.equal(await isWishlisted('stu-1', 'course-1'), false);
});

// ---------------------------------------------------------------------------
// Payment accounts: active-list ordering
// ---------------------------------------------------------------------------

test('payment accounts: active list is ordered by displayOrder and hides inactive accounts', async () => {
  const b = await createPaymentAccount({ label: 'B account', method: 'bank', accountHolder: 'CodeBettle', bankName: 'HBL', accountNumber: '111', displayOrder: 2 });
  const a = await createPaymentAccount({ label: 'A account', method: 'easypaisa', accountHolder: 'CodeBettle', walletNumber: '03001234567', displayOrder: 0 });
  const c = await createPaymentAccount({ label: 'C account', method: 'jazzcash', accountHolder: 'CodeBettle', walletNumber: '03007654321', displayOrder: 1 });
  await createPaymentAccount({ label: 'Off account', method: 'wallet', accountHolder: 'CodeBettle', displayOrder: 0, isActive: false });

  assert.deepEqual(
    (await listActivePaymentAccounts()).map((x) => x.id),
    [a.id, c.id, b.id],
  );
  // The admin list includes the inactive account; the student list does not.
  assert.equal((await listPaymentAccounts()).length, 4);

  await setPaymentAccountActive(c.id, false);
  assert.deepEqual(
    (await listActivePaymentAccounts()).map((x) => x.id),
    [a.id, b.id],
  );
  const renamed = await updatePaymentAccount(a.id, { label: 'A renamed' });
  assert.equal(renamed?.label, 'A renamed');
  assert.equal(await updatePaymentAccount('missing', { label: 'x' }), null);
});

// ---------------------------------------------------------------------------
// Payment submissions: duplicate-pending, review transitions, snapshot
// ---------------------------------------------------------------------------

async function makeAccount() {
  return createPaymentAccount({
    label: 'HBL CodeBettle',
    method: 'bank',
    accountHolder: 'CodeBettle',
    bankName: 'HBL',
    accountNumber: '1234567890',
    displayOrder: 0,
  });
}

test('payment submissions: one pending submission per enrolment', async () => {
  const account = await makeAccount();
  const first = await createPaymentSubmission({
    enrollmentId: 'enr-1',
    paymentAccountId: account.id,
    amountPkr: 5000,
    transactionRef: 'TXN-1',
  });
  assert.ok('submission' in first);
  if (!('submission' in first)) return;
  assert.equal(first.submission.reviewStatus, 'submitted');
  assert.equal(first.submission.method, 'bank');
  assert.equal(first.submission.accountSnapshot.accountNumber, '1234567890');

  const second = await createPaymentSubmission({
    enrollmentId: 'enr-1',
    paymentAccountId: account.id,
    amountPkr: 5000,
    transactionRef: 'TXN-2',
  });
  assert.ok('error' in second);

  // A different enrolment is unaffected.
  const other = await createPaymentSubmission({
    enrollmentId: 'enr-2',
    paymentAccountId: account.id,
    amountPkr: 3000,
    transactionRef: 'TXN-3',
  });
  assert.ok('submission' in other);
  assert.deepEqual((await listPendingSubmissions()).map((s) => s.enrollmentId).sort(), ['enr-1', 'enr-2']);
});

test('payment submissions: approve/reject record reviewedBy/at/note and cannot be re-reviewed', async () => {
  const account = await makeAccount();
  const created = await createPaymentSubmission({
    enrollmentId: 'enr-1',
    paymentAccountId: account.id,
    amountPkr: 5000,
    transactionRef: 'TXN-1',
  });
  assert.ok('submission' in created);
  if (!('submission' in created)) return;
  const id = created.submission.id;

  const approved = await approvePaymentSubmission(id, 'admin-1', 'Matched bank statement');
  assert.equal(approved?.reviewStatus, 'approved');
  assert.equal(approved?.reviewedBy, 'admin-1');
  assert.match(approved?.reviewedAt ?? '', /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(approved?.reviewNote, 'Matched bank statement');
  // Already reviewed: a second review is refused.
  assert.equal(await reviewPaymentSubmission(id, { reviewStatus: 'rejected', reviewedBy: 'admin-1' }), null);
  assert.equal((await getPaymentSubmissionById(id))?.reviewStatus, 'approved');

  // After approval the enrolment may submit again; a rejection records the same fields.
  const created2 = await createPaymentSubmission({
    enrollmentId: 'enr-1',
    paymentAccountId: account.id,
    amountPkr: 5000,
    transactionRef: 'TXN-2',
  });
  assert.ok('submission' in created2);
  if (!('submission' in created2)) return;
  const rejected = await rejectPaymentSubmission(created2.submission.id, 'admin-1', 'No matching transaction');
  assert.equal(rejected?.reviewStatus, 'rejected');
  assert.equal(rejected?.reviewedBy, 'admin-1');
  assert.match(rejected?.reviewedAt ?? '', /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(rejected?.reviewNote, 'No matching transaction');
});

test('payment submissions: snapshot survives account deactivation and deletion', async () => {
  const account = await makeAccount();
  const created = await createPaymentSubmission({
    enrollmentId: 'enr-1',
    paymentAccountId: account.id,
    amountPkr: 5000,
    transactionRef: 'TXN-1',
  });
  assert.ok('submission' in created);
  if (!('submission' in created)) return;

  await setPaymentAccountActive(account.id, false);
  assert.deepEqual(await listActivePaymentAccounts(), []);
  let stored = await getPaymentSubmissionById(created.submission.id);
  assert.equal(stored?.accountSnapshot.label, 'HBL CodeBettle');
  assert.equal(stored?.accountSnapshot.accountNumber, '1234567890');

  assert.equal(await deletePaymentAccount(account.id), true);
  stored = await getPaymentSubmissionById(created.submission.id);
  assert.equal(stored?.accountSnapshot.label, 'HBL CodeBettle');
  assert.equal(stored?.accountSnapshot.bankName, 'HBL');
});

test('payment submissions: unknown account and missing method/snapshot are rejected', async () => {
  const missing = await createPaymentSubmission({
    enrollmentId: 'enr-1',
    paymentAccountId: 'no-such-account',
    amountPkr: 5000,
    transactionRef: 'TXN-1',
  });
  assert.ok('error' in missing);

  const noMethod = await createPaymentSubmission({
    enrollmentId: 'enr-1',
    amountPkr: 5000,
    transactionRef: 'TXN-1',
  });
  assert.ok('error' in noMethod);
});

// ---------------------------------------------------------------------------
// RBAC: payment capabilities are admin-only
// ---------------------------------------------------------------------------

test('rbac: verifyPayment and managePaymentAccounts are admin-only', () => {
  assert.equal(can('admin', 'verifyPayment'), true);
  assert.equal(can('admin', 'managePaymentAccounts'), true);
  assert.equal(can('student', 'verifyPayment'), false);
  assert.equal(can('student', 'managePaymentAccounts'), false);
  assert.equal(can('instructor', 'verifyPayment'), false);
  assert.equal(can('instructor', 'managePaymentAccounts'), false);
});
