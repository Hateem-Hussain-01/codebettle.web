#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/172aee3b721fa8825ccc2045ca647f1302ab5c3a5a485091a80c6cb53c65756e/contract';
import startContract from '../../snapshots/172aee3b721fa8825ccc2045ca647f1302ab5c3a5a485091a80c6cb53c65756e/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/1755dd25ae5e44399cec215c469899aba1f22557dd6847129ca08f980461d7c5/contract';
import endContract from '../../snapshots/1755dd25ae5e44399cec215c469899aba1f22557dd6847129ca08f980461d7c5/contract.json' with { type: 'json' };
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
        table: 'Page',
        columns: [
          col('blocks', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('slug', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('draft'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Page',
        constraint: 'Page_slug_key',
        columns: ['slug'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Page',
        index: 'Page_status_createdAt_idx_58610442',
        columns: ['status', 'createdAt'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
