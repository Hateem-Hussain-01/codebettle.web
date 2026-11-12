#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/ad006496b129389a93658010687e2868f5e6e2b87c15bd94c1e830fa0cfbee23/contract';
import endContract from '../../snapshots/ad006496b129389a93658010687e2868f5e6e2b87c15bd94c1e830fa0cfbee23/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/fb4b9595545d096e16df25444bf346e2b5705bf8b3f04c9668ff55eec4c5abf6/contract';
import startContract from '../../snapshots/fb4b9595545d096e16df25444bf346e2b5705bf8b3f04c9668ff55eec4c5abf6/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Course',
        column: col('certificateTemplateHtml', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
