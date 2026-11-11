#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/11b127ec7577bb2f74443a7d5db27ee578e80d0839fb00a624a2b3093934d65f/contract';
import startContract from '../../snapshots/11b127ec7577bb2f74443a7d5db27ee578e80d0839fb00a624a2b3093934d65f/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/12c5952454673d6a8cca88c3fc235273b109bce1d48517754bea3cc5c63a3b57/contract';
import endContract from '../../snapshots/12c5952454673d6a8cca88c3fc235273b109bce1d48517754bea3cc5c63a3b57/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'InstructorApplication',
        column: col('cvUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'InstructorApplication',
        column: col('demoRecordingUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'InstructorApplication',
        column: col('githubUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'InstructorApplication',
        column: col('linkedinUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
