#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/12c5952454673d6a8cca88c3fc235273b109bce1d48517754bea3cc5c63a3b57/contract';
import startContract from '../../snapshots/12c5952454673d6a8cca88c3fc235273b109bce1d48517754bea3cc5c63a3b57/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/caeb9dc90aed76996f75d9f9bc2603e292000aea7683d3bdbbb49bf1f219f201/contract';
import endContract from '../../snapshots/caeb9dc90aed76996f75d9f9bc2603e292000aea7683d3bdbbb49bf1f219f201/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('adminPermissions', 'json', { codecRef: { codecId: 'pg/json@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
