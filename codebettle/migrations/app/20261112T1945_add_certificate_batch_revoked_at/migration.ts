#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/010b9bc72427f1b2d35d978cf7efa835570f71df252aca6e8027a8d6c18df023/contract';
import startContract from '../../snapshots/010b9bc72427f1b2d35d978cf7efa835570f71df252aca6e8027a8d6c18df023/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/fb4b9595545d096e16df25444bf346e2b5705bf8b3f04c9668ff55eec4c5abf6/contract';
import endContract from '../../snapshots/fb4b9595545d096e16df25444bf346e2b5705bf8b3f04c9668ff55eec4c5abf6/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Certificate',
        column: col('batch', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Certificate',
        column: col('revokedAt', 'timestamptz(3)', {
          codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
