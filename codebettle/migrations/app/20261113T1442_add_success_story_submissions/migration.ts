#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/38f659b319365d7a10277692d1649b37cb751f36ee701aa4ac9dd95bb701ded1/contract';
import endContract from '../../snapshots/38f659b319365d7a10277692d1649b37cb751f36ee701aa4ac9dd95bb701ded1/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/b3738a68e6895c897d9ef37f79cf2fbdcf4788bc5ea29c2bfb20057e4fe2de83/contract';
import startContract from '../../snapshots/b3738a68e6895c897d9ef37f79cf2fbdcf4788bc5ea29c2bfb20057e4fe2de83/contract.json' with { type: 'json' };
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
        table: 'SuccessStoryAchievement',
        columns: [
          col('achievedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('category', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('organization', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('submissionId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'SuccessStoryEvidence',
        columns: [
          col('achievementId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('fileName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('kind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('label', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('mime', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('size', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('url', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'SuccessStorySubmission',
        columns: [
          col('achievementsAfter', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('adminNote', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('advice', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('batchId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('batchNumber', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('beforeJoining', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('biggestAchievement', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('challenges', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('city', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('consentAccuracy', 'bool', { notNull: true, codecRef: { codecId: 'pg/bool@1' } }),
          col('consentContact', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('consentMedia', 'bool', { notNull: true, codecRef: { codecId: 'pg/bool@1' } }),
          col('consentPublication', 'bool', { notNull: true, codecRef: { codecId: 'pg/bool@1' } }),
          col('country', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('courseId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('courseTitle', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('designation', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('experience', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('featured', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('fullName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('githubUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('hackerrankUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('howHelped', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('idempotencyKey', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('instagramUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('instructorName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('joinedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('lablabUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('leetcodeUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('linkedinUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('otherProfileUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('portfolioUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('profilePicturePath', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reviewedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('reviewedBy', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('skillsLearned', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('pending'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('story', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('submissionNumber', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('submittedAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('submitterId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('videoDescription', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('videoPath', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('videoUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('youtubeUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'SuccessStorySubmission_status_check_718289da',
            sql`"status" IN ('pending', 'under_review', 'approved', 'rejected')`,
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'SuccessStorySubmission',
        constraint: 'SuccessStorySubmission_submissionNumber_key',
        columns: ['submissionNumber'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'SuccessStorySubmission',
        constraint: 'SuccessStorySubmission_idempotencyKey_key',
        columns: ['idempotencyKey'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SuccessStoryAchievement',
        index: 'SuccessStoryAchievement_submissionId_idx_89cd3f4e',
        columns: ['submissionId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SuccessStoryEvidence',
        index: 'SuccessStoryEvidence_achievementId_idx_05a27a05',
        columns: ['achievementId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SuccessStorySubmission',
        index: 'SuccessStorySubmission_batchId_idx_84d4b0b9',
        columns: ['batchId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SuccessStorySubmission',
        index: 'SuccessStorySubmission_courseId_idx_12f72d2a',
        columns: ['courseId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SuccessStorySubmission',
        index: 'SuccessStorySubmission_email_submittedAt_idx_d0806a86',
        columns: ['email', 'submittedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SuccessStorySubmission',
        index: 'SuccessStorySubmission_status_submittedAt_idx_0938dd64',
        columns: ['status', 'submittedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'SuccessStorySubmission',
        index: 'SuccessStorySubmission_submitterId_idx_15ca851b',
        columns: ['submitterId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'SuccessStoryAchievement',
        foreignKey: {
          name: 'SuccessStoryAchievement_submissionId_fkey',
          columns: ['submissionId'],
          references: { schema: 'public', table: 'SuccessStorySubmission', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'SuccessStoryEvidence',
        foreignKey: {
          name: 'SuccessStoryEvidence_achievementId_fkey',
          columns: ['achievementId'],
          references: { schema: 'public', table: 'SuccessStoryAchievement', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'SuccessStorySubmission',
        foreignKey: {
          name: 'SuccessStorySubmission_submitterId_fkey',
          columns: ['submitterId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'SuccessStorySubmission',
        foreignKey: {
          name: 'SuccessStorySubmission_courseId_fkey',
          columns: ['courseId'],
          references: { schema: 'public', table: 'Course', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'SuccessStorySubmission',
        foreignKey: {
          name: 'SuccessStorySubmission_batchId_fkey',
          columns: ['batchId'],
          references: { schema: 'public', table: 'Batch', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
