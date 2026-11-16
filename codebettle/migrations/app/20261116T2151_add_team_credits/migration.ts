#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/67a0906ebbd6ee1c8da03ef1c100f55f104527dadb0cd7347488153040e83ac9/contract';
import startContract from '../../snapshots/67a0906ebbd6ee1c8da03ef1c100f55f104527dadb0cd7347488153040e83ac9/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d8be1c164f74f3a1c55e61d91de477d2ab5ef1233f41a0d0c621e4a3faff7794/contract';
import endContract from '../../snapshots/d8be1c164f74f3a1c55e61d91de477d2ab5ef1233f41a0d0c621e4a3faff7794/contract.json' with { type: 'json' };
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
        table: 'TeamCreditLedger',
        columns: [
          col('amount', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('kind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('note', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('referenceId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('teamAccessId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'TeamCreditLedger_kind_check_604125b7',
            sql`"kind" IN ('earn', 'hold', 'release')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'TeamRedemption',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('creditsSpent', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('decidedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('decidedBy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('goody', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('requestedAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('pending'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('teamAccessId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'TeamRedemption_goody_check_667d0f96',
            sql`"goody" IN ('bottle', 'diary', 'pen', 'keychain')`,
          ),
          checkExpression(
            'TeamRedemption_status_check_19a2b525',
            sql`"status" IN ('pending', 'approved', 'rejected')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'TeamReferralAttribution',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('teamAccessId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
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
        table: 'TeamReferralCode',
        columns: [
          col('code', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('teamAccessId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'TeamCreditLedger',
        constraint: 'TeamCreditLedger_kind_referenceId_key',
        columns: ['kind', 'referenceId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'TeamReferralAttribution',
        constraint: 'TeamReferralAttribution_userId_key',
        columns: ['userId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'TeamReferralCode',
        constraint: 'TeamReferralCode_teamAccessId_key',
        columns: ['teamAccessId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'TeamReferralCode',
        constraint: 'TeamReferralCode_code_key',
        columns: ['code'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TeamCreditLedger',
        index: 'TeamCreditLedger_teamAccessId_createdAt_idx_fa68eaf8',
        columns: ['teamAccessId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TeamRedemption',
        index: 'TeamRedemption_status_createdAt_idx_58610442',
        columns: ['status', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TeamRedemption',
        index: 'TeamRedemption_teamAccessId_status_idx_10d0dc7e',
        columns: ['teamAccessId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TeamReferralAttribution',
        index: 'TeamReferralAttribution_teamAccessId_createdAt_idx_fa68eaf8',
        columns: ['teamAccessId', 'createdAt'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
