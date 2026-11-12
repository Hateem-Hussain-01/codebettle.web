#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/42aad708af3193e0ea06469d9a5a88bc76e34dcf4f80501c9dbb887f1055e82c/contract';
import startContract from '../../snapshots/42aad708af3193e0ea06469d9a5a88bc76e34dcf4f80501c9dbb887f1055e82c/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/5d3d3fbbf7948669f2c81cb05cdd04211ad22ae00755295f422550e07cba1902/contract';
import endContract from '../../snapshots/5d3d3fbbf7948669f2c81cb05cdd04211ad22ae00755295f422550e07cba1902/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
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
        table: 'SupportRequest',
        columns: [
          col('adminReply', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('attachmentUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('category', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('courseId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('message', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('resolvedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('resolvedBy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('new'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('studentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('subject', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'Notification',
        column: col('acknowledgedAt', 'timestamptz(3)', {
          codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Notification',
        column: col('announcementId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Notification',
        column: col('category', 'text', {
          notNull: true,
          default: lit('general'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Notification',
        column: col('linkUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Notification',
        column: col('requiresAcknowledge', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'Notification',
        index: 'Notification_announcementId_idx_4871551d',
        columns: ['announcementId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SupportRequest',
        index: 'SupportRequest_courseId_idx_12f72d2a',
        columns: ['courseId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SupportRequest',
        index: 'SupportRequest_resolvedBy_idx_c347fa19',
        columns: ['resolvedBy'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SupportRequest',
        index: 'SupportRequest_status_createdAt_idx_58610442',
        columns: ['status', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SupportRequest',
        index: 'SupportRequest_studentId_createdAt_idx_1ad1933f',
        columns: ['studentId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SupportRequest',
        index: 'SupportRequest_studentId_idx_bf255322',
        columns: ['studentId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Notification',
        foreignKey: {
          name: 'Notification_announcementId_fkey',
          columns: ['announcementId'],
          references: { schema: 'public', table: 'Announcement', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'SupportRequest',
        foreignKey: {
          name: 'SupportRequest_studentId_fkey',
          columns: ['studentId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'SupportRequest',
        foreignKey: {
          name: 'SupportRequest_courseId_fkey',
          columns: ['courseId'],
          references: { schema: 'public', table: 'Course', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'SupportRequest',
        foreignKey: {
          name: 'SupportRequest_resolvedBy_fkey',
          columns: ['resolvedBy'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
