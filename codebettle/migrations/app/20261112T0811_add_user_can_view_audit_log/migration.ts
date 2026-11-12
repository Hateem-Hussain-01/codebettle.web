#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/354f04bc914218afbaecf1860816c3eb17265df49166f0e49a2bdea59c846cba/contract';
import startContract from '../../snapshots/354f04bc914218afbaecf1860816c3eb17265df49166f0e49a2bdea59c846cba/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/7c805afa9e4fbef914a66aae13de2740343b2c1d64d98a42fbe12937165385f5/contract';
import endContract from '../../snapshots/7c805afa9e4fbef914a66aae13de2740343b2c1d64d98a42fbe12937165385f5/contract.json' with { type: 'json' };
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
