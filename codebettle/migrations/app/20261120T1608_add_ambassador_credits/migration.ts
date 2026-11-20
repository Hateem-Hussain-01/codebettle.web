#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/39bf4b7c939aba7fb732aec3459f751a3fc4ca9bf3f47694aebbce419e24028d/contract';
import endContract from '../../snapshots/39bf4b7c939aba7fb732aec3459f751a3fc4ca9bf3f47694aebbce419e24028d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/4e2766c530b45f219045ef0168d29c2a04d2500c26ecdd9ff05c1d596b4af9cc/contract';
import startContract from '../../snapshots/4e2766c530b45f219045ef0168d29c2a04d2500c26ecdd9ff05c1d596b4af9cc/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropTable({ schema: 'public', table: 'ReferralClick' }),
      this.createTable({
        schema: 'public',
        table: 'AmbassadorCreditLedger',
        columns: [
          col('ambassadorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
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
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('AmbassadorCreditLedger_kind_check_cd76a86b', sql`"kind" IN ('earn')`),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'AmbassadorCreditLedger',
        constraint: 'AmbassadorCreditLedger_kind_referenceId_key',
        columns: ['kind', 'referenceId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AmbassadorCreditLedger',
        index: 'AmbassadorCreditLedger_ambassadorId_createdAt_idx_5d54f454',
        columns: ['ambassadorId', 'createdAt'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
