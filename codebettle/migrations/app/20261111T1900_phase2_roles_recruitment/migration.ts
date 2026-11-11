#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/1a361ee24d1bde00a4e91397adecd59050e6a90e2528859867ea328f12778b18/contract';
import startContract from '../../snapshots/1a361ee24d1bde00a4e91397adecd59050e6a90e2528859867ea328f12778b18/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/42aad708af3193e0ea06469d9a5a88bc76e34dcf4f80501c9dbb887f1055e82c/contract';
import endContract from '../../snapshots/42aad708af3193e0ea06469d9a5a88bc76e34dcf4f80501c9dbb887f1055e82c/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
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
        table: 'ApplicationNote',
        columns: [
          col('applicationId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('authorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('body', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('isInternal', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ApplicationStage',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('instructions', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('position', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ApplicationStageHistory',
        columns: [
          col('action', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('actorId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('applicationId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('note', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('stageId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('stageName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Invitation',
        columns: [
          col('contactNumber', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('expiresAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('firstName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('grants', 'json', { notNull: true, codecRef: { codecId: 'pg/json@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('invitedById', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('lastName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('usedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'InstructorApplication',
        column: col('additionalInfo', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'InstructorApplication',
        column: col('userId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'InstructorApplication',
        column: col('whyGoodFit', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('isAdmin', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('isTeacher', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'Invitation',
        constraint: 'Invitation_tokenHash_key',
        columns: ['tokenHash'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ApplicationNote',
        index: 'ApplicationNote_applicationId_createdAt_idx_9384a092',
        columns: ['applicationId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ApplicationNote',
        index: 'ApplicationNote_applicationId_idx_8158f91a',
        columns: ['applicationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ApplicationNote',
        index: 'ApplicationNote_authorId_idx_e47547ed',
        columns: ['authorId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ApplicationStage',
        index: 'ApplicationStage_position_idx_82a01784',
        columns: ['position'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ApplicationStageHistory',
        index: 'ApplicationStageHistory_actorId_idx_a58f6b4b',
        columns: ['actorId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ApplicationStageHistory',
        index: 'ApplicationStageHistory_applicationId_createdAt_idx_9384a092',
        columns: ['applicationId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ApplicationStageHistory',
        index: 'ApplicationStageHistory_applicationId_idx_8158f91a',
        columns: ['applicationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ApplicationStageHistory',
        index: 'ApplicationStageHistory_stageId_idx_43a99835',
        columns: ['stageId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'InstructorApplication',
        index: 'InstructorApplication_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Invitation',
        index: 'Invitation_email_idx_46df9cad',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Invitation',
        index: 'Invitation_invitedById_idx_61689f37',
        columns: ['invitedById'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ApplicationNote',
        foreignKey: {
          name: 'ApplicationNote_applicationId_fkey',
          columns: ['applicationId'],
          references: { schema: 'public', table: 'InstructorApplication', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ApplicationNote',
        foreignKey: {
          name: 'ApplicationNote_authorId_fkey',
          columns: ['authorId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ApplicationStageHistory',
        foreignKey: {
          name: 'ApplicationStageHistory_applicationId_fkey',
          columns: ['applicationId'],
          references: { schema: 'public', table: 'InstructorApplication', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ApplicationStageHistory',
        foreignKey: {
          name: 'ApplicationStageHistory_stageId_fkey',
          columns: ['stageId'],
          references: { schema: 'public', table: 'ApplicationStage', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ApplicationStageHistory',
        foreignKey: {
          name: 'ApplicationStageHistory_actorId_fkey',
          columns: ['actorId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'InstructorApplication',
        foreignKey: {
          name: 'InstructorApplication_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Invitation',
        foreignKey: {
          name: 'Invitation_invitedById_fkey',
          columns: ['invitedById'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
