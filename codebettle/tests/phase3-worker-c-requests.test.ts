/**
 * Phase 3, Worker C — support requests + teacher-message popup.
 *
 * Pure-function tests only (no DB, no network): request category/status
 * labels + badge mapping, attachment validation (size/type), attachment
 * link resolution, and the teacher-message filter used by
 * TeacherMessagePopup. The pages themselves are verified by tsc + build;
 * the request/notification APIs belong to Worker A and are not stubbed
 * here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ATTACHMENT_BYTES,
  REQUEST_CATEGORIES,
  REQUEST_STATUSES,
  requestCategoryLabel,
  requestStatusLabel,
  REQUEST_STATUS_BADGE,
  resolveAttachmentLink,
  validateRequestAttachment,
} from '../components/requests/request-types';
import { isTeacherMessage, type TeacherMessage } from '../components/notifications/TeacherMessagePopup';

function baseNotification(overrides: Partial<TeacherMessage> = {}): TeacherMessage {
  return {
    id: 'n1',
    userId: 'u1',
    type: 'announcement',
    title: 'Hello',
    body: 'Body',
    category: 'general',
    requiresAcknowledge: false,
    readAt: null,
    createdAt: '2026-11-12T00:00:00.000Z',
    ...overrides,
  };
}

test('request categories cover the seven contract categories', () => {
  assert.deepEqual(
    REQUEST_CATEGORIES.map((c) => c.value),
    ['complaints', 'teacher_reviews', 'feature_requests', 'course_issues', 'technical_problems', 'general_requests', 'other'],
  );
  assert.equal(requestCategoryLabel('teacher_reviews'), 'Teacher reviews/feedback');
  assert.equal(requestCategoryLabel('general_requests'), 'General requests');
  assert.equal(requestCategoryLabel('unknown-category'), 'unknown-category');
});

test('request statuses cover the five contract statuses with labels + badges', () => {
  assert.deepEqual(
    REQUEST_STATUSES.map((s) => s.value),
    ['new', 'under_review', 'in_progress', 'resolved', 'rejected'],
  );
  assert.equal(requestStatusLabel('under_review'), 'Under Review');
  assert.equal(requestStatusLabel('in_progress'), 'In Progress');
  assert.equal(REQUEST_STATUS_BADGE.new, 'info');
  assert.equal(REQUEST_STATUS_BADGE.resolved, 'success');
  assert.equal(REQUEST_STATUS_BADGE.rejected, 'danger');
});

test('attachment validation: 5 MB limit and allowed types', () => {
  const pdf = new File(['x'.repeat(100)], 'notes.pdf', { type: 'application/pdf' });
  assert.equal(validateRequestAttachment(pdf), null);

  const big = new File(['x'.repeat(MAX_ATTACHMENT_BYTES + 1)], 'big.pdf', { type: 'application/pdf' });
  assert.match(validateRequestAttachment(big) ?? '', /5 MB/);

  const exe = new File(['x'], 'run.exe', { type: 'application/x-msdownload' });
  assert.match(validateRequestAttachment(exe) ?? '', /PDF, Word document, JPG or PNG/);

  const docx = new File(['x'], 'essay.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  assert.equal(validateRequestAttachment(docx), null);

  const jpg = new File(['x'], 'photo.JPG', { type: 'image/jpeg' });
  assert.equal(validateRequestAttachment(jpg), null);
});

test('attachment link: signed URLs and app paths link directly, raw storage paths do not', () => {
  assert.equal(resolveAttachmentLink(null), null);
  assert.equal(resolveAttachmentLink(undefined), null);
  assert.equal(
    resolveAttachmentLink('https://example.supabase.co/storage/v1/object/sign/request-attachments/a.pdf?token=x'),
    'https://example.supabase.co/storage/v1/object/sign/request-attachments/a.pdf?token=x',
  );
  assert.equal(resolveAttachmentLink('/api/admin/requests/1/attachment'), '/api/admin/requests/1/attachment');
  // A raw storage path must NOT be guessed into a URL.
  assert.equal(resolveAttachmentLink('request-attachments/uuid.pdf'), null);
});

test('teacher-message filter: explicit teacher type matches', () => {
  assert.equal(isTeacherMessage(baseNotification({ type: 'teacher_message' })), true);
});

test('teacher-message filter: course-linked notifications match, other links do not', () => {
  assert.equal(
    isTeacherMessage(baseNotification({ linkUrl: '/student/courses/abc' })),
    true,
  );
  assert.equal(isTeacherMessage(baseNotification({ linkUrl: '/student/notifications' })), false);
  assert.equal(isTeacherMessage(baseNotification({ linkUrl: 'https://codebettle.com/student/courses/abc' })), true);
});

test('teacher-message filter: plain announcements without any marker do NOT match', () => {
  // No linkUrl, no teacher type — a site-wide announcement (even an
  // important one) must never be mislabelled as a personal message
  // from a teacher.
  assert.equal(isTeacherMessage(baseNotification()), false);
  assert.equal(isTeacherMessage(baseNotification({ category: 'important' })), false);
  assert.equal(isTeacherMessage(baseNotification({ category: 'general' })), false);
  assert.equal(isTeacherMessage(baseNotification({ linkUrl: '/student/notifications' })), false);
});
