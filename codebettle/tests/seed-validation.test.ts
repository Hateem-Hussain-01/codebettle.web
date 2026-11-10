import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateSeedFile, validateSeedSql } from '../lib/db/seed-validation';

const SEED_PATH = join(import.meta.dirname, '..', 'prisma', 'seed.sql');

test('the real seed.sql validates: exact counts, FKs, amountPaid 57489, one unusable hash', () => {
  const report = validateSeedFile(SEED_PATH);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, []);
  assert.deepEqual(report.counts, {
    User: 27,
    Course: 8,
    Module: 13,
    Lesson: 25,
    Enrollment: 15,
    LessonProgress: 42,
    Certificate: 6,
    Coupon: 4,
    Announcement: 5,
    Review: 6,
    Testimonial: 6,
    BlogPost: 4,
  });
  assert.equal(report.amountPaidTotal, 57489);
});

test('tampering is caught: a duplicated certificate token fails validation', () => {
  const sql = readFileSync(SEED_PATH, 'utf8');
  const certLines = sql.split('\n').filter((l) => l.startsWith('INSERT INTO "public"."Certificate"'));
  assert.equal(certLines.length, 6, 'expected 6 certificate INSERTs in the seed');
  const tokens = certLines.map((l) => {
    const m = l.match(/'([0-9a-f]{32})'/);
    assert.ok(m, `no 32-hex token in certificate line: ${l.slice(0, 80)}`);
    return m![1];
  });
  const tampered = sql.replace(`'${tokens[1]}'`, `'${tokens[0]}'`);
  const report = validateSeedSql(tampered);
  assert.ok(report.errors.some((e) => e.includes('verification tokens are not unique')));
});

test('a broken seed fails validation instead of throwing', () => {
  const report = validateSeedSql('INSERT INTO "public"."User" ("id") VALUES (\'u1\');');
  assert.ok(report.errors.length > 0);
  assert.ok(report.errors.some((e) => e.includes('User: 1 rows, expected 27')));
});

test('an unparseable statement is reported as an error', () => {
  const report = validateSeedSql('INSERT INTO "public"."User" garbage;');
  assert.ok(report.errors.length > 0);
});
