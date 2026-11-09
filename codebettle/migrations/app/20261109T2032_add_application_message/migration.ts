#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/5981cbb700a4b6fd8e00afcc9e53948466c5c83fc644f0148074d7408f9d6afe/contract';
import endContract from '../../snapshots/5981cbb700a4b6fd8e00afcc9e53948466c5c83fc644f0148074d7408f9d6afe/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/f5df89a7795d8de36a95a09cf54389d41b8d95fadb3e71fa80691ae53eb879c6/contract';
import startContract from '../../snapshots/f5df89a7795d8de36a95a09cf54389d41b8d95fadb3e71fa80691ae53eb879c6/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'InstructorApplication',
        column: col('message', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
