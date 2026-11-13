#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/4cd11d9a7a815172acad0e2917f296636ac6f62ff6ca7da0a655434cc668d75c/contract';
import startContract from '../../snapshots/4cd11d9a7a815172acad0e2917f296636ac6f62ff6ca7da0a655434cc668d75c/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/863ca981dd2f9f8343107dd2540c590a3e2dbecad4a22e090020151661358546/contract';
import endContract from '../../snapshots/863ca981dd2f9f8343107dd2540c590a3e2dbecad4a22e090020151661358546/contract.json' with { type: 'json' };
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
        table: 'EmailTemplate',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('createdById', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('htmlBody', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('isActive', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('subject', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', {
            notNull: true,
            default: lit('broadcast'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'EmailTemplate',
        index: 'EmailTemplate_createdById_idx_8bf640ed',
        columns: ['createdById'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'EmailTemplate',
        index: 'EmailTemplate_type_createdAt_idx_00d94001',
        columns: ['type', 'createdAt'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'EmailTemplate',
        foreignKey: {
          name: 'EmailTemplate_createdById_fkey',
          columns: ['createdById'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
