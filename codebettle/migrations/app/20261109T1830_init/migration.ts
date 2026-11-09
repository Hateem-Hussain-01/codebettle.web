#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/be6ba4e537cc12fcafdcd7454411ee13aaaba76da7410212e356d23bd67823cb/contract';
import endContract from '../../snapshots/be6ba4e537cc12fcafdcd7454411ee13aaaba76da7410212e356d23bd67823cb/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'Announcement',
        columns: [
          col('authorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('content', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('courseId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('isActive', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Announcement_type_check_44c8ec98',
            sql`"type" IN ('site_wide', 'course')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'AuditLog',
        columns: [
          col('action', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('actorId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('detail', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('entity', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('entityId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ip', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'BlogPost',
        columns: [
          col('authorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('authorName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('category', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('content', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('excerpt', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('isPublished', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('pdfUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('publishedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('readTime', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('slug', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tags', 'text[]', { notNull: true, codecRef: { codecId: 'pg/text@1', many: true } }),
          col('thumbnail', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'BlogPost_tags_elem_not_null_aecbe9e2',
            sql`array_position("tags", NULL) IS NULL`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Certificate',
        columns: [
          col('certificateNumber', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('courseId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('enrollmentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('issuedAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('studentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('verificationToken', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ContactMessage',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('isRead', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('message', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('subject', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Coupon',
        columns: [
          col('applicableCourses', 'text[]', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('code', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('expiresAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('isActive', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('maxUses', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('usedCount', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('value', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Coupon_applicableCourses_elem_not_null_93fe69db',
            sql`array_position("applicableCourses", NULL) IS NULL`,
          ),
          checkExpression('Coupon_type_check_dc70c601', sql`"type" IN ('percentage', 'fixed')`),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'CouponRedemption',
        columns: [
          col('couponId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('enrollmentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('redeemedAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Course',
        columns: [
          col('category', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('completedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('deletedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('description', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('enrolledCount', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('instructorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('isCompleted', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('isFeatured', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('isFree', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('level', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('longDescription', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('pricePkr', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('rating', 'float8', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/float8@1' },
          }),
          col('requirements', 'text[]', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('reviewCount', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('schedule', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('slug', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('draft'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('tags', 'text[]', { notNull: true, codecRef: { codecId: 'pg/text@1', many: true } }),
          col('thumbnail', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('whatYouLearn', 'text[]', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('zoomLink', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Course_category_check_41534903',
            sql`"category" IN ('Web_Development', 'Mobile_Development', 'Data_Science', 'UI_UX_Design', 'DevOps', 'Programming')`,
          ),
          checkExpression(
            'Course_level_check_7287b838',
            sql`"level" IN ('beginner', 'intermediate', 'advanced')`,
          ),
          checkExpression(
            'Course_requirements_elem_not_null_1096206b',
            sql`array_position("requirements", NULL) IS NULL`,
          ),
          checkExpression(
            'Course_status_check_6db19c90',
            sql`"status" IN ('draft', 'published', 'archived')`,
          ),
          checkExpression(
            'Course_tags_elem_not_null_aecbe9e2',
            sql`array_position("tags", NULL) IS NULL`,
          ),
          checkExpression(
            'Course_whatYouLearn_elem_not_null_c176ea90',
            sql`array_position("whatYouLearn", NULL) IS NULL`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Enrollment',
        columns: [
          col('amountPaid', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('certificateEligible', 'bool', { codecRef: { codecId: 'pg/bool@1' } }),
          col('completedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('couponUsed', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('courseId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('deletedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('enrolledAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('isCompleted', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('paymentStatus', 'text', {
            notNull: true,
            default: lit('pending'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('studentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Enrollment_paymentStatus_check_bb8505df',
            sql`"paymentStatus" IN ('paid', 'free', 'pending')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'InstructorApplication',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('experience', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('expertise', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('phone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reviewedBy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('pending'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'InstructorApplication_status_check_19a2b525',
            sql`"status" IN ('pending', 'approved', 'rejected')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Lesson',
        columns: [
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('duration', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('materials', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('moduleId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('position', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('recordingUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'LessonProgress',
        columns: [
          col('completedAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('enrollmentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('lessonId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['enrollmentId', 'lessonId'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'LoginEvent',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ip', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('success', 'bool', { notNull: true, codecRef: { codecId: 'pg/bool@1' } }),
          col('userAgent', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Module',
        columns: [
          col('courseId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('position', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Notification',
        columns: [
          col('body', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('readAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'PasswordReset',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('expiresAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('usedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Payment',
        columns: [
          col('amountPkr', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('couponId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('enrollmentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('provider', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('providerRef', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('pending'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Payment_status_check_701001d1',
            sql`"status" IN ('pending', 'paid', 'failed', 'refunded')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Review',
        columns: [
          col('comment', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('courseId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('rating', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('studentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Session',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('expiresAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ip', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('lastSeenAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('revokedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('userAgent', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Testimonial',
        columns: [
          col('comment', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('courseTitle', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('date', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('rating', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('studentAvatar', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('studentName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'User',
        columns: [
          col('avatar', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('bio', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('deletedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('expertise', 'text[]', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('joinedAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('passwordHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('phone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('socialLinks', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('active'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'User_expertise_elem_not_null_0a98fe9c',
            sql`array_position("expertise", NULL) IS NULL`,
          ),
          checkExpression(
            'User_role_check_92517c9b',
            sql`"role" IN ('student', 'instructor', 'admin')`,
          ),
          checkExpression('User_status_check_697c26d8', sql`"status" IN ('active', 'suspended')`),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'BlogPost',
        constraint: 'BlogPost_slug_key',
        columns: ['slug'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Certificate',
        constraint: 'Certificate_enrollmentId_key',
        columns: ['enrollmentId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Certificate',
        constraint: 'Certificate_certificateNumber_key',
        columns: ['certificateNumber'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Certificate',
        constraint: 'Certificate_verificationToken_key',
        columns: ['verificationToken'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Coupon',
        constraint: 'Coupon_code_key',
        columns: ['code'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'CouponRedemption',
        constraint: 'CouponRedemption_couponId_enrollmentId_key',
        columns: ['couponId', 'enrollmentId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Course',
        constraint: 'Course_slug_key',
        columns: ['slug'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Enrollment',
        constraint: 'Enrollment_studentId_courseId_key',
        columns: ['studentId', 'courseId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Lesson',
        constraint: 'Lesson_moduleId_position_key',
        columns: ['moduleId', 'position'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Module',
        constraint: 'Module_courseId_position_key',
        columns: ['courseId', 'position'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'PasswordReset',
        constraint: 'PasswordReset_tokenHash_key',
        columns: ['tokenHash'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Payment',
        constraint: 'Payment_provider_providerRef_key',
        columns: ['provider', 'providerRef'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Review',
        constraint: 'Review_studentId_courseId_key',
        columns: ['studentId', 'courseId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'User',
        constraint: 'User_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Announcement',
        index: 'Announcement_authorId_idx_e47547ed',
        columns: ['authorId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Announcement',
        index: 'Announcement_courseId_idx_12f72d2a',
        columns: ['courseId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AuditLog',
        index: 'AuditLog_actorId_idx_a58f6b4b',
        columns: ['actorId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AuditLog',
        index: 'AuditLog_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'BlogPost',
        index: 'BlogPost_authorId_idx_e47547ed',
        columns: ['authorId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Certificate',
        index: 'Certificate_courseId_idx_12f72d2a',
        columns: ['courseId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Certificate',
        index: 'Certificate_studentId_idx_bf255322',
        columns: ['studentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CouponRedemption',
        index: 'CouponRedemption_couponId_idx_a9dd19dc',
        columns: ['couponId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CouponRedemption',
        index: 'CouponRedemption_enrollmentId_idx_ee5e79c5',
        columns: ['enrollmentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Course',
        index: 'Course_instructorId_idx_6b1d9b50',
        columns: ['instructorId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Enrollment',
        index: 'Enrollment_courseId_idx_12f72d2a',
        columns: ['courseId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Enrollment',
        index: 'Enrollment_studentId_idx_bf255322',
        columns: ['studentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'InstructorApplication',
        index: 'InstructorApplication_reviewedBy_idx_0b622ca2',
        columns: ['reviewedBy'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Lesson',
        index: 'Lesson_moduleId_idx_04fe188b',
        columns: ['moduleId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'LessonProgress',
        index: 'LessonProgress_enrollmentId_idx_ee5e79c5',
        columns: ['enrollmentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'LessonProgress',
        index: 'LessonProgress_lessonId_idx_e358970d',
        columns: ['lessonId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'LoginEvent',
        index: 'LoginEvent_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Module',
        index: 'Module_courseId_idx_12f72d2a',
        columns: ['courseId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Notification',
        index: 'Notification_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Notification',
        index: 'Notification_userId_readAt_idx_8bd92969',
        columns: ['userId', 'readAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PasswordReset',
        index: 'PasswordReset_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Payment',
        index: 'Payment_couponId_idx_a9dd19dc',
        columns: ['couponId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Payment',
        index: 'Payment_enrollmentId_idx_ee5e79c5',
        columns: ['enrollmentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Payment',
        index: 'Payment_status_createdAt_idx_58610442',
        columns: ['status', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Review',
        index: 'Review_courseId_idx_12f72d2a',
        columns: ['courseId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Review',
        index: 'Review_studentId_idx_bf255322',
        columns: ['studentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Session',
        index: 'Session_userId_expiresAt_idx_9721b56d',
        columns: ['userId', 'expiresAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Session',
        index: 'Session_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Announcement',
        foreignKey: {
          name: 'Announcement_courseId_fkey',
          columns: ['courseId'],
          references: { schema: 'public', table: 'Course', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Announcement',
        foreignKey: {
          name: 'Announcement_authorId_fkey',
          columns: ['authorId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AuditLog',
        foreignKey: {
          name: 'AuditLog_actorId_fkey',
          columns: ['actorId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'BlogPost',
        foreignKey: {
          name: 'BlogPost_authorId_fkey',
          columns: ['authorId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Certificate',
        foreignKey: {
          name: 'Certificate_studentId_fkey',
          columns: ['studentId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Certificate',
        foreignKey: {
          name: 'Certificate_courseId_fkey',
          columns: ['courseId'],
          references: { schema: 'public', table: 'Course', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Certificate',
        foreignKey: {
          name: 'Certificate_enrollmentId_fkey',
          columns: ['enrollmentId'],
          references: { schema: 'public', table: 'Enrollment', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'CouponRedemption',
        foreignKey: {
          name: 'CouponRedemption_couponId_fkey',
          columns: ['couponId'],
          references: { schema: 'public', table: 'Coupon', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'CouponRedemption',
        foreignKey: {
          name: 'CouponRedemption_enrollmentId_fkey',
          columns: ['enrollmentId'],
          references: { schema: 'public', table: 'Enrollment', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Course',
        foreignKey: {
          name: 'Course_instructorId_fkey',
          columns: ['instructorId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Enrollment',
        foreignKey: {
          name: 'Enrollment_studentId_fkey',
          columns: ['studentId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Enrollment',
        foreignKey: {
          name: 'Enrollment_courseId_fkey',
          columns: ['courseId'],
          references: { schema: 'public', table: 'Course', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'InstructorApplication',
        foreignKey: {
          name: 'InstructorApplication_reviewedBy_fkey',
          columns: ['reviewedBy'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Lesson',
        foreignKey: {
          name: 'Lesson_moduleId_fkey',
          columns: ['moduleId'],
          references: { schema: 'public', table: 'Module', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'LessonProgress',
        foreignKey: {
          name: 'LessonProgress_enrollmentId_fkey',
          columns: ['enrollmentId'],
          references: { schema: 'public', table: 'Enrollment', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'LessonProgress',
        foreignKey: {
          name: 'LessonProgress_lessonId_fkey',
          columns: ['lessonId'],
          references: { schema: 'public', table: 'Lesson', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'LoginEvent',
        foreignKey: {
          name: 'LoginEvent_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Module',
        foreignKey: {
          name: 'Module_courseId_fkey',
          columns: ['courseId'],
          references: { schema: 'public', table: 'Course', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Notification',
        foreignKey: {
          name: 'Notification_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PasswordReset',
        foreignKey: {
          name: 'PasswordReset_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Payment',
        foreignKey: {
          name: 'Payment_enrollmentId_fkey',
          columns: ['enrollmentId'],
          references: { schema: 'public', table: 'Enrollment', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Payment',
        foreignKey: {
          name: 'Payment_couponId_fkey',
          columns: ['couponId'],
          references: { schema: 'public', table: 'Coupon', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Review',
        foreignKey: {
          name: 'Review_studentId_fkey',
          columns: ['studentId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Review',
        foreignKey: {
          name: 'Review_courseId_fkey',
          columns: ['courseId'],
          references: { schema: 'public', table: 'Course', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Session',
        foreignKey: {
          name: 'Session_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
