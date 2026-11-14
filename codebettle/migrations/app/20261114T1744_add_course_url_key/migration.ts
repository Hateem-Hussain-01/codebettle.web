#!/usr/bin/env -S node
import { col, Migration, MigrationCLI } from '@prisma/orm-postgres/migration';
import postgres from '@prisma/orm-postgres/runtime';
import { contractFromJson } from '@prisma/orm-postgres/static';
import type { Contract as End } from '../../snapshots/a40cc5e4a66528e1947cc3d073d687449fb376f45141e3e86a996f7bb313235d/contract';
import endContract from '../../snapshots/a40cc5e4a66528e1947cc3d073d687449fb376f45141e3e86a996f7bb313235d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e6c0d779d0dc3299d62efb211ade4e7e40ad06e45e82f02483b495e139710944/contract';
import startContract from '../../snapshots/e6c0d779d0dc3299d62efb211ade4e7e40ad06e45e82f02483b495e139710944/contract.json' with { type: 'json' };

// The typed SQL builder over the end-state contract. Constructing the
// client opens no connection (lazy); the migration only builds plans.
const client = postgres({ contract: contractFromJson<End>(endContract) });
const { sql: db, contract } = client;

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Course',
        column: col('urlKey', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.dataTransform(contract, 'backfill-Course-urlKey', {
        backfillsColumn: { schema: 'public', table: 'Course', column: 'urlKey' },
        // Any row still holding NULL in urlKey means work remains.
        check: () => db.public.Course.select('id').where((f, fns) => fns.eq(f.urlKey, null)).limit(1),
        // Backfill: one fresh 48-char random hex key per existing row.
        // Extension-free on purpose (no pgcrypto dependency): two
        // gen_random_uuid() calls (core since Postgres 13) give 64 hex
        // chars once the hyphens are stripped; the first 48 are kept.
        // gen_random_uuid() is VOLATILE, so each row gets its own values.
        // Same expression as the SQL twin (codebettle-course-urlkey-migration.sql).
        run: () =>
          client.raw
            .sql`UPDATE "public"."Course" SET "urlKey" = left(translate(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 48) WHERE "urlKey" IS NULL`
            .affectedCount()
            .build(),
      }),
      this.setNotNull({ schema: 'public', table: 'Course', column: 'urlKey' }),
      this.addUnique({
        schema: 'public',
        table: 'Course',
        constraint: 'Course_urlKey_key',
        columns: ['urlKey'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
