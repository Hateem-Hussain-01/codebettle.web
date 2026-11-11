#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1a361ee24d1bde00a4e91397adecd59050e6a90e2528859867ea328f12778b18/contract';
import endContract from '../../snapshots/1a361ee24d1bde00a4e91397adecd59050e6a90e2528859867ea328f12778b18/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/caeb9dc90aed76996f75d9f9bc2603e292000aea7683d3bdbbb49bf1f219f201/contract';
import startContract from '../../snapshots/caeb9dc90aed76996f75d9f9bc2603e292000aea7683d3bdbbb49bf1f219f201/contract.json' with { type: 'json' };
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

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'Note',
        columns: [
          col('content', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('courseId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'PaymentAccount',
        columns: [
          col('accountHolder', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('accountNumber', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('bankName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('displayOrder', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('iban', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('instructions', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('isActive', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('label', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('method', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('walletNumber', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'PaymentAccount_method_check_f996f86e',
            sql`"method" IN ('bank', 'easypaisa', 'jazzcash', 'wallet', 'other')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'PaymentSubmission',
        columns: [
          col('accountSnapshot', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('amountPkr', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('enrollmentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('method', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('paymentAccountId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('proofUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reviewNote', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reviewStatus', 'text', {
            notNull: true,
            default: lit('submitted'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('reviewedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('reviewedBy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('submittedAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('transactionRef', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'PaymentSubmission_method_check_f996f86e',
            sql`"method" IN ('bank', 'easypaisa', 'jazzcash', 'wallet', 'other')`,
          ),
          checkExpression(
            'PaymentSubmission_reviewStatus_check_8f23a4d8',
            sql`"reviewStatus" IN ('submitted', 'approved', 'rejected')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Wishlist',
        columns: [
          col('courseId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Wishlist',
        constraint: 'Wishlist_userId_courseId_key',
        columns: ['userId', 'courseId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Note',
        index: 'Note_courseId_idx_12f72d2a',
        columns: ['courseId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Note',
        index: 'Note_userId_createdAt_idx_f726f04a',
        columns: ['userId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Note',
        index: 'Note_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PaymentAccount',
        index: 'PaymentAccount_isActive_displayOrder_idx_9399faee',
        columns: ['isActive', 'displayOrder'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PaymentSubmission',
        index: 'PaymentSubmission_enrollmentId_idx_ee5e79c5',
        columns: ['enrollmentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PaymentSubmission',
        index: 'PaymentSubmission_enrollmentId_reviewStatus_idx_2c5289df',
        columns: ['enrollmentId', 'reviewStatus'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PaymentSubmission',
        index: 'PaymentSubmission_paymentAccountId_idx_6d12e2f9',
        columns: ['paymentAccountId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PaymentSubmission',
        index: 'PaymentSubmission_reviewStatus_submittedAt_idx_ebd06ffa',
        columns: ['reviewStatus', 'submittedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PaymentSubmission',
        index: 'PaymentSubmission_reviewedBy_idx_0b622ca2',
        columns: ['reviewedBy'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Wishlist',
        index: 'Wishlist_courseId_idx_12f72d2a',
        columns: ['courseId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Wishlist',
        index: 'Wishlist_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Note',
        foreignKey: {
          name: 'Note_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Note',
        foreignKey: {
          name: 'Note_courseId_fkey',
          columns: ['courseId'],
          references: { schema: 'public', table: 'Course', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PaymentSubmission',
        foreignKey: {
          name: 'PaymentSubmission_enrollmentId_fkey',
          columns: ['enrollmentId'],
          references: { schema: 'public', table: 'Enrollment', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PaymentSubmission',
        foreignKey: {
          name: 'PaymentSubmission_paymentAccountId_fkey',
          columns: ['paymentAccountId'],
          references: { schema: 'public', table: 'PaymentAccount', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PaymentSubmission',
        foreignKey: {
          name: 'PaymentSubmission_reviewedBy_fkey',
          columns: ['reviewedBy'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Wishlist',
        foreignKey: {
          name: 'Wishlist_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Wishlist',
        foreignKey: {
          name: 'Wishlist_courseId_fkey',
          columns: ['courseId'],
          references: { schema: 'public', table: 'Course', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
