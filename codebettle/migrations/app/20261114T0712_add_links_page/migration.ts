#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/30f6fc41b6cfd0b75e303345a6e5dfa16fd974c44c6b63588b55e901fc3f3d1c/contract';
import endContract from '../../snapshots/30f6fc41b6cfd0b75e303345a6e5dfa16fd974c44c6b63588b55e901fc3f3d1c/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/d4ce9adf1c16a3c166863f72d6f960ecc11c860741509da7ac8a01ab6a0cdfa3/contract';
import startContract from '../../snapshots/d4ce9adf1c16a3c166863f72d6f960ecc11c860741509da7ac8a01ab6a0cdfa3/contract.json' with { type: 'json' };
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
        table: 'Link',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('enabled', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('icon', 'text', {
            notNull: true,
            default: lit('link'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('label', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('order', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
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
        table: 'Link',
        index: 'Link_enabled_order_idx_a20b7215',
        columns: ['enabled', 'order'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
