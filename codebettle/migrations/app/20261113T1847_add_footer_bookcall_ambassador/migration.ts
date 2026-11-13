#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/172aee3b721fa8825ccc2045ca647f1302ab5c3a5a485091a80c6cb53c65756e/contract';
import endContract from '../../snapshots/172aee3b721fa8825ccc2045ca647f1302ab5c3a5a485091a80c6cb53c65756e/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/d34358cf5bd579183fc13b0a5b0f47beacaf9f97a39905517fcabf05db278e56/contract';
import startContract from '../../snapshots/d34358cf5bd579183fc13b0a5b0f47beacaf9f97a39905517fcabf05db278e56/contract.json' with { type: 'json' };
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
        table: 'AmbassadorApplication',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('departmentSemester', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('fullName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('leadershipPosition', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('priorAmbassadorExperience', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('promotionPlan', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('pending'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('university', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('whatsapp', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'AmbassadorApplication_status_check_19a2b525',
            sql`"status" IN ('pending', 'approved', 'rejected')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'BookACall',
        columns: [
          col('courseInterest', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('currentStatus', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('fullName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('guidanceNeeded', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('phone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('preferredContact', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('new'),
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
            'BookACall_status_check_1221e9dd',
            sql`"status" IN ('new', 'contacted', 'done')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Subscriber',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Subscriber',
        constraint: 'Subscriber_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AmbassadorApplication',
        index: 'AmbassadorApplication_email_createdAt_idx_6e3c0d8a',
        columns: ['email', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AmbassadorApplication',
        index: 'AmbassadorApplication_status_createdAt_idx_58610442',
        columns: ['status', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'BookACall',
        index: 'BookACall_email_createdAt_idx_6e3c0d8a',
        columns: ['email', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'BookACall',
        index: 'BookACall_status_createdAt_idx_58610442',
        columns: ['status', 'createdAt'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
