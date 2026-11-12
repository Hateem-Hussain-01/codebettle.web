#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/0af7fadc85431fbf0451e1d9a675ab1ed1182c04701562503f386d75ad3f16be/contract';
import endContract from '../../snapshots/0af7fadc85431fbf0451e1d9a675ab1ed1182c04701562503f386d75ad3f16be/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/7c805afa9e4fbef914a66aae13de2740343b2c1d64d98a42fbe12937165385f5/contract';
import startContract from '../../snapshots/7c805afa9e4fbef914a66aae13de2740343b2c1d64d98a42fbe12937165385f5/contract.json' with { type: 'json' };
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
        table: 'FormDefinition',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('createdById', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('schema', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('slug', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('draft'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'FormSubmission',
        columns: [
          col('data', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('formId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reviewed', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('submittedAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('submitterId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'FormDefinition',
        constraint: 'FormDefinition_slug_key',
        columns: ['slug'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'FormDefinition',
        index: 'FormDefinition_createdById_idx_8bf640ed',
        columns: ['createdById'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'FormDefinition',
        index: 'FormDefinition_status_createdAt_idx_58610442',
        columns: ['status', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'FormSubmission',
        index: 'FormSubmission_formId_idx_3c13a9fa',
        columns: ['formId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'FormSubmission',
        index: 'FormSubmission_formId_submittedAt_idx_b451b238',
        columns: ['formId', 'submittedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'FormSubmission',
        index: 'FormSubmission_submitterId_idx_15ca851b',
        columns: ['submitterId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'FormDefinition',
        foreignKey: {
          name: 'FormDefinition_createdById_fkey',
          columns: ['createdById'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'FormSubmission',
        foreignKey: {
          name: 'FormSubmission_formId_fkey',
          columns: ['formId'],
          references: { schema: 'public', table: 'FormDefinition', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'FormSubmission',
        foreignKey: {
          name: 'FormSubmission_submitterId_fkey',
          columns: ['submitterId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
