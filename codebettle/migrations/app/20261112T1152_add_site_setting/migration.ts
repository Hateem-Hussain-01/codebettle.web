#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/010b9bc72427f1b2d35d978cf7efa835570f71df252aca6e8027a8d6c18df023/contract';
import endContract from '../../snapshots/010b9bc72427f1b2d35d978cf7efa835570f71df252aca6e8027a8d6c18df023/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/0af7fadc85431fbf0451e1d9a675ab1ed1182c04701562503f386d75ad3f16be/contract';
import startContract from '../../snapshots/0af7fadc85431fbf0451e1d9a675ab1ed1182c04701562503f386d75ad3f16be/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'SiteSetting',
        columns: [
          col('key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('value', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['key'])],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
