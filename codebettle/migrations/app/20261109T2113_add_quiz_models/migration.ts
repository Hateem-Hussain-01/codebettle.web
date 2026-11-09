#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/03d06814342d1cecd507e77850eb512320ef50a694e9ab6a7934b890a125caa8/contract';
import endContract from '../../snapshots/03d06814342d1cecd507e77850eb512320ef50a694e9ab6a7934b890a125caa8/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/f5df89a7795d8de36a95a09cf54389d41b8d95fadb3e71fa80691ae53eb879c6/contract';
import startContract from '../../snapshots/f5df89a7795d8de36a95a09cf54389d41b8d95fadb3e71fa80691ae53eb879c6/contract.json' with { type: 'json' };
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
        table: 'Quiz',
        columns: [
          col('attemptsAllowed', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('availableFrom', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('availableUntil', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('courseId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('createdById', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('deletedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('difficulty', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('instructions', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('parseWarnings', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('passMark', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('pdfStoragePath', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('pdfUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('scoringPolicy', 'text', {
            notNull: true,
            default: lit('exact'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('showCorrectAnswers', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('showResultsToStudents', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('draft'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('timeLimitMin', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('topics', 'text[]', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('updatedAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Quiz_difficulty_check_160b9fc4',
            sql`"difficulty" IN ('beginner', 'intermediate', 'advanced')`,
          ),
          checkExpression(
            'Quiz_scoringPolicy_check_7aeb3d4a',
            sql`"scoringPolicy" IN ('exact', 'partial')`,
          ),
          checkExpression(
            'Quiz_status_check_6db19c90',
            sql`"status" IN ('draft', 'published', 'archived')`,
          ),
          checkExpression(
            'Quiz_topics_elem_not_null_1acb8bbc',
            sql`array_position("topics", NULL) IS NULL`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'QuizAnswer',
        columns: [
          col('attemptId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('isCorrect', 'bool', { codecRef: { codecId: 'pg/bool@1' } }),
          col('needsManualReview', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('pointsAwarded', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('questionId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('selectedOptionIds', 'text[]', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('textAnswer', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'QuizAnswer_selectedOptionIds_elem_not_null_be6c2108',
            sql`array_position("selectedOptionIds", NULL) IS NULL`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'QuizAttempt',
        columns: [
          col('dueAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('quizId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('score', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('startedAt', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('in_progress'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('studentId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('submittedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('submittedLate', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('timeSpentSec', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('totalPoints', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'QuizAttempt_status_check_a49ec839',
            sql`"status" IN ('in_progress', 'submitted')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'QuizOption',
        columns: [
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('isCorrect', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('position', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('questionId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('text', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'QuizQuestion',
        columns: [
          col('acceptedAnswers', 'text[]', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('correctText', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('difficulty', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('needsReview', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('points', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('position', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('prompt', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('quizId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reviewNote', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('topic', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'QuizQuestion_acceptedAnswers_elem_not_null_17328033',
            sql`array_position("acceptedAnswers", NULL) IS NULL`,
          ),
          checkExpression(
            'QuizQuestion_difficulty_check_160b9fc4',
            sql`"difficulty" IN ('beginner', 'intermediate', 'advanced')`,
          ),
          checkExpression(
            'QuizQuestion_type_check_eb39468a',
            sql`"type" IN ('mcq', 'fill_blank', 'checkbox', 'choose_two', 'choose_three')`,
          ),
        ],
      }),
      this.addColumn({
        schema: 'public',
        table: 'InstructorApplication',
        column: col('message', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('notificationPrefs', 'json', { codecRef: { codecId: 'pg/json@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'QuizAnswer',
        constraint: 'QuizAnswer_attemptId_questionId_key',
        columns: ['attemptId', 'questionId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'QuizOption',
        constraint: 'QuizOption_questionId_position_key',
        columns: ['questionId', 'position'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'QuizQuestion',
        constraint: 'QuizQuestion_quizId_position_key',
        columns: ['quizId', 'position'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Quiz',
        index: 'Quiz_courseId_idx_12f72d2a',
        columns: ['courseId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Quiz',
        index: 'Quiz_courseId_status_idx_7c6c2bd8',
        columns: ['courseId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Quiz',
        index: 'Quiz_createdById_idx_8bf640ed',
        columns: ['createdById'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'QuizAnswer',
        index: 'QuizAnswer_attemptId_idx_94f50eb9',
        columns: ['attemptId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'QuizAnswer',
        index: 'QuizAnswer_questionId_idx_fdb42076',
        columns: ['questionId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'QuizAttempt',
        index: 'QuizAttempt_quizId_idx_c721979c',
        columns: ['quizId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'QuizAttempt',
        index: 'QuizAttempt_quizId_studentId_idx_30a37c38',
        columns: ['quizId', 'studentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'QuizAttempt',
        index: 'QuizAttempt_studentId_idx_bf255322',
        columns: ['studentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'QuizOption',
        index: 'QuizOption_questionId_idx_fdb42076',
        columns: ['questionId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'QuizQuestion',
        index: 'QuizQuestion_quizId_idx_c721979c',
        columns: ['quizId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Quiz',
        foreignKey: {
          name: 'Quiz_courseId_fkey',
          columns: ['courseId'],
          references: { schema: 'public', table: 'Course', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Quiz',
        foreignKey: {
          name: 'Quiz_createdById_fkey',
          columns: ['createdById'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'QuizAnswer',
        foreignKey: {
          name: 'QuizAnswer_attemptId_fkey',
          columns: ['attemptId'],
          references: { schema: 'public', table: 'QuizAttempt', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'QuizAnswer',
        foreignKey: {
          name: 'QuizAnswer_questionId_fkey',
          columns: ['questionId'],
          references: { schema: 'public', table: 'QuizQuestion', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'QuizAttempt',
        foreignKey: {
          name: 'QuizAttempt_quizId_fkey',
          columns: ['quizId'],
          references: { schema: 'public', table: 'Quiz', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'QuizAttempt',
        foreignKey: {
          name: 'QuizAttempt_studentId_fkey',
          columns: ['studentId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'QuizOption',
        foreignKey: {
          name: 'QuizOption_questionId_fkey',
          columns: ['questionId'],
          references: { schema: 'public', table: 'QuizQuestion', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'QuizQuestion',
        foreignKey: {
          name: 'QuizQuestion_quizId_fkey',
          columns: ['quizId'],
          references: { schema: 'public', table: 'Quiz', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
