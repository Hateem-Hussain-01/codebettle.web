#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/39bf4b7c939aba7fb732aec3459f751a3fc4ca9bf3f47694aebbce419e24028d/contract';
import startContract from '../../snapshots/39bf4b7c939aba7fb732aec3459f751a3fc4ca9bf3f47694aebbce419e24028d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f49bc76c869052d79ae6a1222fe7c34eef4eb777c321e3385c8859f54e436a54/contract';
import endContract from '../../snapshots/f49bc76c869052d79ae6a1222fe7c34eef4eb777c321e3385c8859f54e436a54/contract.json' with { type: 'json' };
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
      this.dropCheckConstraint({
        schema: 'public',
        table: 'AmbassadorCreditLedger',
        constraint: 'AmbassadorCreditLedger_kind_check_cd76a86b',
      }),
      this.createTable({
        schema: 'public',
        table: 'AmbassadorRedemption',
        columns: [
          col('ambassadorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
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
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'AmbassadorRedemption_goody_check_667d0f96',
            sql`"goody" IN ('bottle', 'diary', 'pen', 'keychain')`,
          ),
          checkExpression(
            'AmbassadorRedemption_status_check_19a2b525',
            sql`"status" IN ('pending', 'approved', 'rejected')`,
          ),
        ],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'AmbassadorCreditLedger',
        constraint: 'AmbassadorCreditLedger_kind_check_604125b7',
        expression: sql`"kind" IN ('earn', 'hold', 'release')`,
      }),
      this.createIndex({
        schema: 'public',
        table: 'AmbassadorRedemption',
        index: 'AmbassadorRedemption_ambassadorId_status_idx_857a51a1',
        columns: ['ambassadorId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AmbassadorRedemption',
        index: 'AmbassadorRedemption_status_createdAt_idx_58610442',
        columns: ['status', 'createdAt'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
