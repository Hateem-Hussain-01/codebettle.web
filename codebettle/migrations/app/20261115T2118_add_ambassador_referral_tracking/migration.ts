#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/3491ed93cb5a68e3d1be6befddb3943f5eb9d5c5f13cfb2965e14480c787a136/contract';
import startContract from '../../snapshots/3491ed93cb5a68e3d1be6befddb3943f5eb9d5c5f13cfb2965e14480c787a136/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f7940e923f52d88e2b97366f7b9ffe1dc1372030c773f66bfbd14622a3a9d201/contract';
import endContract from '../../snapshots/f7940e923f52d88e2b97366f7b9ffe1dc1372030c773f66bfbd14622a3a9d201/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'Ambassador',
        columns: [
          col('applicationId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('groupCountUpdatedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('groupLink', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('groupMemberCount', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('referralCode', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('active'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('userId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Ambassador_status_check_11063666',
            sql`"status" IN ('active', 'inactive')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'AmbassadorMessage',
        columns: [
          col('ambassadorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('message', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('read', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ReferralAttribution',
        columns: [
          col('ambassadorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ReferralClick',
        columns: [
          col('ambassadorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('clickedAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('day', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ip', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Ambassador',
        constraint: 'Ambassador_applicationId_key',
        columns: ['applicationId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Ambassador',
        constraint: 'Ambassador_userId_key',
        columns: ['userId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Ambassador',
        constraint: 'Ambassador_email_key',
        columns: ['email'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Ambassador',
        constraint: 'Ambassador_referralCode_key',
        columns: ['referralCode'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ReferralAttribution',
        constraint: 'ReferralAttribution_userId_key',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Ambassador',
        index: 'Ambassador_email_createdAt_idx_6e3c0d8a',
        columns: ['email', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Ambassador',
        index: 'Ambassador_status_createdAt_idx_58610442',
        columns: ['status', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AmbassadorMessage',
        index: 'AmbassadorMessage_ambassadorId_createdAt_idx_5d54f454',
        columns: ['ambassadorId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'AmbassadorMessage',
        index: 'AmbassadorMessage_read_createdAt_idx_bb5ea906',
        columns: ['read', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ReferralAttribution',
        index: 'ReferralAttribution_ambassadorId_createdAt_idx_5d54f454',
        columns: ['ambassadorId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ReferralClick',
        index: 'ReferralClick_ambassadorId_clickedAt_idx_cc7a22ca',
        columns: ['ambassadorId', 'clickedAt'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
