#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/4e9403ff3a00335096aa1341a2eb567abd157d60512bacf55330d7bd986125be/contract';
import endContract from '../../snapshots/4e9403ff3a00335096aa1341a2eb567abd157d60512bacf55330d7bd986125be/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/5d3d3fbbf7948669f2c81cb05cdd04211ad22ae00755295f422550e07cba1902/contract';
import startContract from '../../snapshots/5d3d3fbbf7948669f2c81cb05cdd04211ad22ae00755295f422550e07cba1902/contract.json' with { type: 'json' };
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
        table: 'SocialLink',
        columns: [
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
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('isEnabled', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('url', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SocialLink',
        index: 'SocialLink_isEnabled_displayOrder_idx_858b3c85',
        columns: ['isEnabled', 'displayOrder'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
