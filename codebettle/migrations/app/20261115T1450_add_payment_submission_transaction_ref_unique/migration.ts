#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/3491ed93cb5a68e3d1be6befddb3943f5eb9d5c5f13cfb2965e14480c787a136/contract';
import endContract from '../../snapshots/3491ed93cb5a68e3d1be6befddb3943f5eb9d5c5f13cfb2965e14480c787a136/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a40cc5e4a66528e1947cc3d073d687449fb376f45141e3e86a996f7bb313235d/contract';
import startContract from '../../snapshots/a40cc5e4a66528e1947cc3d073d687449fb376f45141e3e86a996f7bb313235d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addUnique({
        schema: 'public',
        table: 'PaymentSubmission',
        constraint: 'PaymentSubmission_transactionRef_key',
        columns: ['transactionRef'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
