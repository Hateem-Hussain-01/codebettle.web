#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/0f292394d665356e52d27eb09ebbc9864fe5e90fcfb2ee72af53984fcce40821/contract';
import endContract from '../../snapshots/0f292394d665356e52d27eb09ebbc9864fe5e90fcfb2ee72af53984fcce40821/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/5d3d3fbbf7948669f2c81cb05cdd04211ad22ae00755295f422550e07cba1902/contract';
import startContract from '../../snapshots/5d3d3fbbf7948669f2c81cb05cdd04211ad22ae00755295f422550e07cba1902/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('canViewAuditLog', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
