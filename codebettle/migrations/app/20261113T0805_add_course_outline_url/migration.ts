#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/4cd11d9a7a815172acad0e2917f296636ac6f62ff6ca7da0a655434cc668d75c/contract';
import endContract from '../../snapshots/4cd11d9a7a815172acad0e2917f296636ac6f62ff6ca7da0a655434cc668d75c/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/ad006496b129389a93658010687e2868f5e6e2b87c15bd94c1e830fa0cfbee23/contract';
import startContract from '../../snapshots/ad006496b129389a93658010687e2868f5e6e2b87c15bd94c1e830fa0cfbee23/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Course',
        column: col('outlineUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
