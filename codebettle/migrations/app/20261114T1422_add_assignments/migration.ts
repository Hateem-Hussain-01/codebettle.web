#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1e54b8fab5c36897213d5679375b2db6485649eb6ade4414cc4a76e551bee58a/contract';
import endContract from '../../snapshots/1e54b8fab5c36897213d5679375b2db6485649eb6ade4414cc4a76e551bee58a/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/30f6fc41b6cfd0b75e303345a6e5dfa16fd974c44c6b63588b55e901fc3f3d1c/contract';
import startContract from '../../snapshots/30f6fc41b6cfd0b75e303345a6e5dfa16fd974c44c6b63588b55e901fc3f3d1c/contract.json' with { type: 'json' };
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
        table: 'Assignment',
        columns: [
          col('batchId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('courseId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('createdBy', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('description', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('dueDate', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('maxMarks', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'AssignmentSubmission',
        columns: [
          col('assignmentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('colabUrl', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('feedback', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('gradedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('gradedBy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('marks', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('submitted'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('studentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('submittedAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'AssignmentSubmission_status_check_05f9290c',
            sql`"status" IN ('submitted', 'graded', 'late')`,
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'AssignmentSubmission',
        constraint: 'AssignmentSubmission_assignmentId_studentId_key',
        columns: ['assignmentId', 'studentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Assignment',
        index: 'Assignment_batchId_idx_84d4b0b9',
        columns: ['batchId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Assignment',
        index: 'Assignment_courseId_idx_12f72d2a',
        columns: ['courseId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Assignment',
        index: 'Assignment_createdBy_idx_ba0f792f',
        columns: ['createdBy'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AssignmentSubmission',
        index: 'AssignmentSubmission_assignmentId_idx_8cfb4ac4',
        columns: ['assignmentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AssignmentSubmission',
        index: 'AssignmentSubmission_gradedBy_idx_142121bc',
        columns: ['gradedBy'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AssignmentSubmission',
        index: 'AssignmentSubmission_studentId_idx_bf255322',
        columns: ['studentId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Assignment',
        foreignKey: {
          name: 'Assignment_courseId_fkey',
          columns: ['courseId'],
          references: { schema: 'public', table: 'Course', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Assignment',
        foreignKey: {
          name: 'Assignment_batchId_fkey',
          columns: ['batchId'],
          references: { schema: 'public', table: 'Batch', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Assignment',
        foreignKey: {
          name: 'Assignment_createdBy_fkey',
          columns: ['createdBy'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AssignmentSubmission',
        foreignKey: {
          name: 'AssignmentSubmission_assignmentId_fkey',
          columns: ['assignmentId'],
          references: { schema: 'public', table: 'Assignment', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AssignmentSubmission',
        foreignKey: {
          name: 'AssignmentSubmission_studentId_fkey',
          columns: ['studentId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'AssignmentSubmission',
        foreignKey: {
          name: 'AssignmentSubmission_gradedBy_fkey',
          columns: ['gradedBy'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
