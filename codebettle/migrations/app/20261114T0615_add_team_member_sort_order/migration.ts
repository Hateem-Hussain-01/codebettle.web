#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/1755dd25ae5e44399cec215c469899aba1f22557dd6847129ca08f980461d7c5/contract';
import startContract from '../../snapshots/1755dd25ae5e44399cec215c469899aba1f22557dd6847129ca08f980461d7c5/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d4ce9adf1c16a3c166863f72d6f960ecc11c860741509da7ac8a01ab6a0cdfa3/contract';
import endContract from '../../snapshots/d4ce9adf1c16a3c166863f72d6f960ecc11c860741509da7ac8a01ab6a0cdfa3/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropIndex({
        schema: 'public',
        table: 'TeamMember',
        index: 'TeamMember_enabled_level_orderInLevel_idx_65721722',
      }),
      this.addColumn({
        schema: 'public',
        table: 'TeamMember',
        column: col('sortOrder', 'int4', {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      // Backfill the new global display order from the old hierarchy
      // order (Management → Departments alphabetically → Trainers,
      // then orderInLevel, then id) so existing members keep their
      // public sequence. Must run after addColumn and BEFORE the
      // dropColumn below — it reads orderInLevel.
      rawSql({
        id: 'data.public.TeamMember.backfill-sort-order',
        label: 'Backfill team member display order',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: { schema: 'public', objectType: 'table', name: 'TeamMember' },
        },
        precheck: [],
        execute: [
          {
            description: 'Backfill sortOrder from hierarchy order',
            sql: `UPDATE "public"."TeamMember" t SET "sortOrder" = sub.rn - 1 FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY CASE "level" WHEN 'management' THEN 0 WHEN 'department' THEN 1 WHEN 'trainer' THEN 2 ELSE 3 END, CASE WHEN "level" = 'department' THEN COALESCE("department", '') ELSE '' END, "orderInLevel", "id") AS rn FROM "public"."TeamMember") sub WHERE t."id" = sub."id"`,
          },
        ],
        postcheck: [
          {
            description: 'verify sortOrder values are dense (0..n-1)',
            sql: 'SELECT (COUNT(DISTINCT "sortOrder") = COUNT(*)) AS "result" FROM "public"."TeamMember"',
            params: [],
            expectation: { expects: 'present', object: 'dense sortOrder values' },
          },
        ],
      }),
      this.dropColumn({ schema: 'public', table: 'TeamMember', column: 'orderInLevel' }),
      this.createIndex({
        schema: 'public',
        table: 'TeamMember',
        index: 'TeamMember_enabled_sortOrder_idx_f5142a7d',
        columns: ['enabled', 'sortOrder'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
