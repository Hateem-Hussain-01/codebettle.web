import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import { getUserByEmail } from '../lib/db/users';
import {
  importUsers,
  previewUserImport,
} from '../lib/services/user-import-service';
import type { Actor } from '../lib/services/errors';

const D = (s: string) => new Date(s);

const ADMIN: Actor = { id: 'admin-1', role: 'admin', name: 'Admin' };
const STUDENT: Actor = { id: 'stu-1', role: 'student', name: 'Ali' };

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
});

const MIXED_CSV = [
  'name,email,role,phone',
  'Ali Khan,ali@example.com,student,0300',
  'Bob,bad-email,student,',
  ',noname@example.com,student,',
  'Carol,carol@example.com,admin,',
  'Dave,dave@example.com,teacher,',
  'Eve,eve@example.com,student,',
  'Eve Dup,eve@example.com,instructor,',
  'Frank,frank@example.com,instructor,0301',
].join('\n');

test('preview flags bad emails, missing names, bad roles, admin role, and duplicates', async () => {
  const preview = await previewUserImport(ADMIN, MIXED_CSV);
  assert.ok(!('error' in preview), JSON.stringify(preview));
  assert.equal(preview.totalRows, 8);
  assert.equal(preview.validCount, 2);
  assert.equal(preview.invalidCount, 6);
  assert.deepEqual(preview.valid.map((r) => r.email), ['eve@example.com', 'frank@example.com']);

  const byLine = new Map(preview.invalid.map((r) => [r.line, r.errors.join(' ')]));
  assert.match(byLine.get(2) ?? '', /already exists/); // ali@example.com is in the DB
  assert.match(byLine.get(3) ?? '', /not a valid email/);
  assert.match(byLine.get(4) ?? '', /Name is required/);
  assert.match(byLine.get(5) ?? '', /Admin accounts cannot be imported/);
  assert.match(byLine.get(6) ?? '', /not valid/);
  assert.match(byLine.get(8) ?? '', /Duplicate email/);
});

test('preview writes nothing and non-admins cannot preview', async () => {
  const before = (await fake.orm.public.User.all()).length;
  const preview = await previewUserImport(ADMIN, MIXED_CSV);
  assert.ok(!('error' in preview));
  assert.equal((await fake.orm.public.User.all()).length, before);

  const asStudent = await previewUserImport(STUDENT, MIXED_CSV);
  assert.ok('error' in asStudent && asStudent.status === 403, JSON.stringify(asStudent));
});

test('confirm imports only valid rows, with unusable passwords', async () => {
  const preview = await previewUserImport(ADMIN, MIXED_CSV);
  assert.ok(!('error' in preview));
  const result = await importUsers(ADMIN, preview.valid);
  assert.ok(!('error' in result), JSON.stringify(result));
  assert.equal(result.importedCount, 2);
  assert.equal(result.skippedCount, 0);
  assert.deepEqual(result.imported.map((u) => u.email), ['eve@example.com', 'frank@example.com']);

  const eve = await getUserByEmail('eve@example.com');
  assert.ok(eve);
  assert.equal(eve.role, 'student');
  // A bcrypt hash of a random value — not empty, not a known password.
  assert.match(eve.passwordHash, /^\$2b\$12\$/);
  const bob = await getUserByEmail('bad-email');
  assert.equal(bob, null);
  const carol = await getUserByEmail('carol@example.com');
  assert.equal(carol, null);
});

test('confirm without valid rows is a 400', async () => {
  const result = await importUsers(ADMIN, []);
  assert.ok('error' in result && result.status === 400, JSON.stringify(result));
});

test('quoted commas in names parse correctly', async () => {
  const preview = await previewUserImport(ADMIN, 'name,email,role,phone\n"Doe, Jane",jane@example.com,student,\n"Quoted ""Nick"" Smith",nick@example.com,instructor,');
  assert.ok(!('error' in preview), JSON.stringify(preview));
  assert.equal(preview.validCount, 2);
  assert.equal(preview.valid[0].name, 'Doe, Jane');
  assert.equal(preview.valid[1].name, 'Quoted "Nick" Smith');
});

test('more than 200 rows is rejected', async () => {
  const rows = Array.from({ length: 201 }, (_, i) => `User ${i},user${i}@example.com,student,`);
  const preview = await previewUserImport(ADMIN, ['name,email,role,phone', ...rows].join('\n'));
  assert.ok('error' in preview && preview.status === 400, JSON.stringify(preview));
  assert.match(preview.error, /200/);
});

test('a password column is rejected as an unknown column', async () => {
  const preview = await previewUserImport(
    ADMIN,
    'name,email,role,phone,password\nAli,ali2@example.com,student,,secret123',
  );
  assert.ok('error' in preview && preview.status === 400, JSON.stringify(preview));
  assert.match(preview.error, /Unknown column.*password/);
});

test('empty file and missing header are 400s', async () => {
  const empty = await previewUserImport(ADMIN, '   \n');
  assert.ok('error' in empty && empty.status === 400, JSON.stringify(empty));

  const noHeader = await previewUserImport(ADMIN, 'Ali,ali2@example.com,student');
  assert.ok('error' in noHeader && noHeader.status === 400, JSON.stringify(noHeader));
  // A data row in the header position is not a valid header at all.
  assert.match(noHeader.error, /Unknown column/);
});

test('phone column may be omitted from the header', async () => {
  const preview = await previewUserImport(ADMIN, 'name,email,role\nGina,gina@example.com,student');
  assert.ok(!('error' in preview), JSON.stringify(preview));
  assert.equal(preview.validCount, 1);
  assert.equal(preview.valid[0].phone, undefined);
});
