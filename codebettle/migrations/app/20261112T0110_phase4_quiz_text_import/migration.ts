#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/354f04bc914218afbaecf1860816c3eb17265df49166f0e49a2bdea59c846cba/contract';
import endContract from '../../snapshots/354f04bc914218afbaecf1860816c3eb17265df49166f0e49a2bdea59c846cba/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/4e9403ff3a00335096aa1341a2eb567abd157d60512bacf55330d7bd986125be/contract';
import startContract from '../../snapshots/4e9403ff3a00335096aa1341a2eb567abd157d60512bacf55330d7bd986125be/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'QuizQuestion',
        column: col('explanation', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
