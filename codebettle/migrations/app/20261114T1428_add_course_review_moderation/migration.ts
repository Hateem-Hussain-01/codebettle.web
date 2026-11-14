#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/1e54b8fab5c36897213d5679375b2db6485649eb6ade4414cc4a76e551bee58a/contract';
import startContract from '../../snapshots/1e54b8fab5c36897213d5679375b2db6485649eb6ade4414cc4a76e551bee58a/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e6c0d779d0dc3299d62efb211ade4e7e40ad06e45e82f02483b495e139710944/contract';
import endContract from '../../snapshots/e6c0d779d0dc3299d62efb211ade4e7e40ad06e45e82f02483b495e139710944/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Review',
        column: col('status', 'text', {
          notNull: true,
          default: lit('approved'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Review',
        column: col('title', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumnWithTemporaryDefault({
        schema: 'public',
        table: 'Review',
        column: 'updatedAt',
        type: 'timestamptz(3)',
        // Existing reviews get updatedAt = migration time (they were never
        // edited; the SQL twin backfills updatedAt = createdAt instead, which
        // is the more precise value — same schema either way).
        temporaryDefault: sql`now()`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Review',
        constraint: 'Review_status_check_19a2b525',
        expression: sql`"status" IN ('pending', 'approved', 'rejected')`,
      }),
      this.createIndex({
        schema: 'public',
        table: 'Review',
        index: 'Review_courseId_status_idx_7c6c2bd8',
        columns: ['courseId', 'status'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
