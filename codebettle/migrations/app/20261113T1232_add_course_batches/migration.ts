#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/863ca981dd2f9f8343107dd2540c590a3e2dbecad4a22e090020151661358546/contract';
import startContract from '../../snapshots/863ca981dd2f9f8343107dd2540c590a3e2dbecad4a22e090020151661358546/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/b3738a68e6895c897d9ef37f79cf2fbdcf4788bc5ea29c2bfb20057e4fe2de83/contract';
import endContract from '../../snapshots/b3738a68e6895c897d9ef37f79cf2fbdcf4788bc5ea29c2bfb20057e4fe2de83/contract.json' with { type: 'json' };
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
        table: 'Batch',
        columns: [
          col('batchNumber', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('capacity', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('courseId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('endDate', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('instructorId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('startDate', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('upcoming'),
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
            'Batch_status_check_b09b7536',
            sql`"status" IN ('upcoming', 'ongoing', 'completed')`,
          ),
        ],
      }),
      this.addColumn({
        schema: 'public',
        table: 'Enrollment',
        column: col('batchId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'Batch',
        constraint: 'Batch_courseId_batchNumber_key',
        columns: ['courseId', 'batchNumber'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Batch',
        index: 'Batch_courseId_idx_12f72d2a',
        columns: ['courseId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Batch',
        index: 'Batch_instructorId_idx_6b1d9b50',
        columns: ['instructorId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Enrollment',
        index: 'Enrollment_batchId_idx_84d4b0b9',
        columns: ['batchId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Batch',
        foreignKey: {
          name: 'Batch_courseId_fkey',
          columns: ['courseId'],
          references: { schema: 'public', table: 'Course', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Batch',
        foreignKey: {
          name: 'Batch_instructorId_fkey',
          columns: ['instructorId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Enrollment',
        foreignKey: {
          name: 'Enrollment_batchId_fkey',
          columns: ['batchId'],
          references: { schema: 'public', table: 'Batch', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
