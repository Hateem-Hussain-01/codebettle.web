#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/238127c695653ffee40c8b8f5654167f9edcc86f3df77f4cc55473e4770feda0/contract';
import endContract from '../../snapshots/238127c695653ffee40c8b8f5654167f9edcc86f3df77f4cc55473e4770feda0/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/5981cbb700a4b6fd8e00afcc9e53948466c5c83fc644f0148074d7408f9d6afe/contract';
import startContract from '../../snapshots/5981cbb700a4b6fd8e00afcc9e53948466c5c83fc644f0148074d7408f9d6afe/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('notificationPrefs', 'json', { codecRef: { codecId: 'pg/json@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
