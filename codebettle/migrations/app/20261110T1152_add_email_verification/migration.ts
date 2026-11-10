#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/03d06814342d1cecd507e77850eb512320ef50a694e9ab6a7934b890a125caa8/contract';
import startContract from '../../snapshots/03d06814342d1cecd507e77850eb512320ef50a694e9ab6a7934b890a125caa8/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/11b127ec7577bb2f74443a7d5db27ee578e80d0839fb00a624a2b3093934d65f/contract';
import endContract from '../../snapshots/11b127ec7577bb2f74443a7d5db27ee578e80d0839fb00a624a2b3093934d65f/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'EmailVerification',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('expiresAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('usedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('emailVerifiedAt', 'timestamptz(3)', {
          codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
        }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'EmailVerification',
        constraint: 'EmailVerification_tokenHash_key',
        columns: ['tokenHash'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'EmailVerification',
        index: 'EmailVerification_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'EmailVerification',
        foreignKey: {
          name: 'EmailVerification_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
