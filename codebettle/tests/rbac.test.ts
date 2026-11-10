import test from 'node:test';
import assert from 'node:assert/strict';
import { can, hasRole, ownsCourse, ownsEnrollment } from '../lib/rbac';

test('capability matrix: students cannot manage, instructors cannot publish, admins can do everything listed', () => {
  assert.equal(can('student', 'manageUsers'), false);
  assert.equal(can('student', 'manageCoupons'), false);
  assert.equal(can('student', 'enroll'), true);
  assert.equal(can('student', 'reviewOwnCourse'), true);
  assert.equal(can('instructor', 'createCourse'), true);
  assert.equal(can('instructor', 'editOwnCourse'), true);
  assert.equal(can('instructor', 'editAnyCourse'), false);
  assert.equal(can('instructor', 'publishCourse'), false);
  assert.equal(can('instructor', 'issueCertificate'), false);
  assert.equal(can('instructor', 'proposeCertificate'), true);
  assert.equal(can('admin', 'manageUsers'), true);
  assert.equal(can('admin', 'publishCourse'), true);
  assert.equal(can('admin', 'issueCertificate'), true);
  assert.equal(can('admin', 'viewAuditLogs'), true);
});

test('hasRole rejects a missing session', () => {
  assert.equal(hasRole(null, ['admin']), false);
  assert.equal(hasRole({ role: 'student' }, ['admin', 'instructor']), false);
  assert.equal(hasRole({ role: 'admin' }, ['admin']), true);
});

test('ownership: instructor A cannot touch instructor B courses; students only their own records', () => {
  const instA = { id: 'inst-1', role: 'instructor' as const };
  assert.equal(ownsCourse(instA, 'inst-1'), true);
  assert.equal(ownsCourse(instA, 'inst-2'), false);
  assert.equal(ownsCourse({ id: 'student-1', role: 'student' as const }, 'inst-1'), false);

  const student = { id: 'student-1', role: 'student' as const };
  assert.equal(ownsEnrollment(student, 'student-1'), true);
  assert.equal(ownsEnrollment(student, 'student-2'), false);
  assert.equal(ownsEnrollment({ id: 'admin-1', role: 'admin' as const }, 'student-2'), true);
  assert.equal(ownsEnrollment(null, 'student-1'), false);
});
