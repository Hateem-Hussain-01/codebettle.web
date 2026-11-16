#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/4e2766c530b45f219045ef0168d29c2a04d2500c26ecdd9ff05c1d596b4af9cc/contract';
import endContract from '../../snapshots/4e2766c530b45f219045ef0168d29c2a04d2500c26ecdd9ff05c1d596b4af9cc/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/d8be1c164f74f3a1c55e61d91de477d2ab5ef1233f41a0d0c621e4a3faff7794/contract';
import startContract from '../../snapshots/d8be1c164f74f3a1c55e61d91de477d2ab5ef1233f41a0d0c621e4a3faff7794/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'TeamMember',
        column: col('visibleSocials', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
