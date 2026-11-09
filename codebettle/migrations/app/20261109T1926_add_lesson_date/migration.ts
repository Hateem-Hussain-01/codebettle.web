#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/be6ba4e537cc12fcafdcd7454411ee13aaaba76da7410212e356d23bd67823cb/contract';
import startContract from '../../snapshots/be6ba4e537cc12fcafdcd7454411ee13aaaba76da7410212e356d23bd67823cb/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f5df89a7795d8de36a95a09cf54389d41b8d95fadb3e71fa80691ae53eb879c6/contract';
import endContract from '../../snapshots/f5df89a7795d8de36a95a09cf54389d41b8d95fadb3e71fa80691ae53eb879c6/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Lesson',
        column: col('date', 'timestamptz(3)', {
          codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
