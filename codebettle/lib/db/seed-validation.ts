/**
 * Seed validation (Phase 2). Pure functions — unit-tested against the
 * real prisma/seed.sql.
 *
 * Parses the INSERT statements and checks, without a database:
 * - Row counts per table (27 users / 8 courses / 13 modules / 25 lessons /
 *   15 enrolments / 42 lesson-progress / 6 certificates / 4 coupons /
 *   5 announcements / 6 reviews / 6 testimonials / 4 blog posts).
 * - amountPaid total = PKR 57,489.
 * - Every foreign key resolves to a seeded row.
 * - All 6 certificates belong to completed enrolments.
 * - Certificate verification tokens are 6 distinct 32-hex strings.
 * - All 27 user password hashes are one identical bcrypt hash that is NOT
 *   one of the old public demo hashes (seeded accounts have no known
 *   password — see seed.sql header).
 * - No leftover placeholders, undefined, or NaN literals.
 */
import { readFileSync } from 'node:fs';

export interface SeedValidationReport {
  counts: Record<string, number>;
  amountPaidTotal: number;
  errors: string[];
  warnings: string[];
}

export const EXPECTED_COUNTS: Record<string, number> = {
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
};

export const EXPECTED_AMOUNT_PAID_TOTAL = 57489;

/** The three bcrypt hashes of the old public demo passwords (must NOT appear in the seed). */
const FORBIDDEN_HASHES = [
  '$2b$12$CeiswGnI82IF1zhbhlqEDu.sXnOO5qJk5XAARXORXiGpqzhfMcpb6',
  '$2b$12$PWgnrUgbriievwTtFYSmL.Lje8MdbLQonjTgVSoCJGiQjFVp2OfsS',
  '$2b$12$Tu75TZnipoukQcyzcZ8k5uvHc/LZ0gTAwvKVnMkS8qSIHl17NEJyK',
];

/** Split SQL into statements, respecting single-quoted strings ('' = escaped quote). */
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let current = '';
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inStr) {
      current += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          current += sql[i + 1];
          i++;
        } else {
          inStr = false;
        }
      }
    } else if (ch === "'") {
      inStr = true;
      current += ch;
    } else if (ch === ';') {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current);
  return out;
}

/** Split a VALUES tuple on top-level commas (quotes, parens, brackets, braces aware). */
function splitValues(tuple: string): string[] {
  const out: string[] = [];
  let current = '';
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < tuple.length; i++) {
    const ch = tuple[i];
    if (inStr) {
      current += ch;
      if (ch === "'") {
        if (tuple[i + 1] === "'") {
          current += tuple[i + 1];
          i++;
        } else {
          inStr = false;
        }
      }
    } else if (ch === "'") {
      inStr = true;
      current += ch;
    } else if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      current += ch;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

type SqlValue = string | number | boolean | null | string[];

/** Parse one SQL literal into a JS value (casts like ::timestamptz / ::jsonb are stripped). */
function parseLiteral(token: string): SqlValue {
  const t = token.trim();
  if (t === 'NULL') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t.startsWith("'")) {
    // Find the closing quote ('' = escaped quote inside).
    let end = 1;
    let value = '';
    while (end < t.length) {
      if (t[end] === "'") {
        if (t[end + 1] === "'") {
          value += "'";
          end += 2;
        } else {
          break;
        }
      } else {
        value += t[end];
        end++;
      }
    }
    // Array literal '{...}' (Postgres text[]).
    if (value.startsWith('{') && value.endsWith('}')) {
      const inner = value.slice(1, -1);
      if (!inner) return [];
      const items: string[] = [];
      const re = /"((?:[^"\\]|\\.)*)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(inner)) !== null) items.push(m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
      return items;
    }
    return value;
  }
  return t;
}

interface ParsedInsert {
  table: string;
  columns: string[];
  values: SqlValue[];
}

function parseInserts(sql: string): ParsedInsert[] {
  const inserts: ParsedInsert[] = [];
  for (const stmt of splitStatements(sql)) {
    const trimmed = stmt.trim();
    if (!trimmed.startsWith('INSERT INTO')) continue;
    const m = trimmed.match(
      /^INSERT INTO "public"\."(\w+)" \(([^)]+)\) VALUES \(([\s\S]*)\)$/,
    );
    if (!m) throw new Error(`Unparseable INSERT statement: ${trimmed.slice(0, 120)}`);
    const columns = m[2].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const values = splitValues(m[3]).map(parseLiteral);
    if (columns.length !== values.length) {
      throw new Error(
        `Column/value count mismatch in ${m[1]}: ${columns.length} columns, ${values.length} values`,
      );
    }
    inserts.push({ table: m[1], columns, values });
  }
  return inserts;
}

export function validateSeedSql(sql: string): SeedValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const counts: Record<string, number> = {};
  const rowsByTable = new Map<string, Array<Record<string, SqlValue>>>();

  let inserts: ParsedInsert[];
  try {
    inserts = parseInserts(sql);
  } catch (e) {
    return { counts, amountPaidTotal: 0, errors: [String(e)], warnings };
  }

  for (const ins of inserts) {
    counts[ins.table] = (counts[ins.table] ?? 0) + 1;
    const row: Record<string, SqlValue> = {};
    ins.columns.forEach((c, i) => {
      row[c] = ins.values[i];
    });
    if (!rowsByTable.has(ins.table)) rowsByTable.set(ins.table, []);
    rowsByTable.get(ins.table)!.push(row);
  }

  // 1. Expected counts.
  for (const [table, expected] of Object.entries(EXPECTED_COUNTS)) {
    const actual = counts[table] ?? 0;
    if (actual !== expected) errors.push(`${table}: ${actual} rows, expected ${expected}`);
  }
  for (const table of Object.keys(counts)) {
    if (!(table in EXPECTED_COUNTS)) warnings.push(`Unexpected table in seed: ${table} (${counts[table]} rows)`);
  }

  const get = (table: string) => rowsByTable.get(table) ?? [];
  const idSet = (table: string, col = 'id') =>
    new Set(get(table).map((r) => r[col]).filter((v): v is string => typeof v === 'string'));

  const userIds = idSet('User');
  const courseIds = idSet('Course');
  const moduleIds = idSet('Module');
  const lessonIds = idSet('Lesson');
  const enrollmentIds = idSet('Enrollment');
  const couponIds = idSet('Coupon');

  // 2. Foreign keys resolve.
  const checkFk = (table: string, col: string, target: Set<string>, targetName: string) => {
    for (const row of get(table)) {
      const v = row[col];
      if (v === null || v === undefined) continue;
      if (typeof v !== 'string' || !target.has(v)) {
        errors.push(`${table}.${col}=${String(v)} does not resolve to ${targetName}`);
      }
    }
  };
  checkFk('Course', 'instructorId', userIds, 'User.id');
  checkFk('Module', 'courseId', courseIds, 'Course.id');
  checkFk('Lesson', 'moduleId', moduleIds, 'Module.id');
  checkFk('Enrollment', 'studentId', userIds, 'User.id');
  checkFk('Enrollment', 'courseId', courseIds, 'Course.id');
  checkFk('LessonProgress', 'enrollmentId', enrollmentIds, 'Enrollment.id');
  checkFk('LessonProgress', 'lessonId', lessonIds, 'Lesson.id');
  checkFk('Certificate', 'studentId', userIds, 'User.id');
  checkFk('Certificate', 'courseId', courseIds, 'Course.id');
  checkFk('Certificate', 'enrollmentId', enrollmentIds, 'Enrollment.id');
  checkFk('Review', 'studentId', userIds, 'User.id');
  checkFk('Review', 'courseId', courseIds, 'Course.id');
  checkFk('Announcement', 'courseId', courseIds, 'Course.id');
  checkFk('Announcement', 'authorId', userIds, 'User.id');
  checkFk('BlogPost', 'authorId', userIds, 'User.id');

  // 3. amountPaid total.
  let amountPaidTotal = 0;
  for (const row of get('Enrollment')) {
    const v = row.amountPaid;
    if (typeof v !== 'number') errors.push(`Enrollment ${row.id}: amountPaid is not a number`);
    else amountPaidTotal += v;
  }
  if (amountPaidTotal !== EXPECTED_AMOUNT_PAID_TOTAL) {
    errors.push(`amountPaid total is ${amountPaidTotal}, expected ${EXPECTED_AMOUNT_PAID_TOTAL}`);
  }

  // 4. Certificates belong to completed enrolments.
  const completed = new Set(
    get('Enrollment').filter((r) => r.isCompleted === true).map((r) => r.id),
  );
  for (const row of get('Certificate')) {
    if (!completed.has(row.enrollmentId)) {
      errors.push(`Certificate ${row.id}: enrollment ${row.enrollmentId} is not completed`);
    }
  }

  // 5. Certificate tokens: 6 distinct 32-hex strings.
  const tokens = get('Certificate').map((r) => r.verificationToken);
  if (tokens.length !== 6) errors.push(`Expected 6 certificate tokens, found ${tokens.length}`);
  if (new Set(tokens).size !== tokens.length) errors.push('Certificate verification tokens are not unique');
  for (const t of tokens) {
    if (typeof t !== 'string' || !/^[0-9a-f]{32}$/.test(t)) {
      errors.push(`Certificate token is not 32 hex chars: ${String(t)}`);
    }
  }

  // 6. Password hashes: one identical bcrypt hash, not an old demo hash.
  const hashes = get('User').map((r) => r.passwordHash);
  if (hashes.length !== 27) errors.push(`Expected 27 user password hashes, found ${hashes.length}`);
  if (new Set(hashes).size !== 1) errors.push('Seeded users do not all share one password hash');
  for (const h of hashes) {
    if (typeof h !== 'string' || !/^\$2[aby]\$\d+\$/.test(h)) {
      errors.push(`User password hash is not a bcrypt hash: ${String(h)}`);
    }
    if (FORBIDDEN_HASHES.includes(h as string)) {
      errors.push('Seed contains an old public demo password hash — seeded accounts would be log-in-able');
    }
  }

  // 7. Uniqueness within the seed.
  const checkUnique = (table: string, col: string) => {
    const vals = get(table).map((r) => r[col]);
    if (new Set(vals).size !== vals.length) errors.push(`${table}.${col} has duplicates`);
  };
  checkUnique('User', 'email');
  checkUnique('Course', 'slug');
  checkUnique('Certificate', 'certificateNumber');
  checkUnique('Certificate', 'verificationToken');
  checkUnique('Coupon', 'code');
  const enrPairs = get('Enrollment').map((r) => `${r.studentId}/${r.courseId}`);
  if (new Set(enrPairs).size !== enrPairs.length) errors.push('Enrollment (studentId, courseId) has duplicates');
  const progPairs = get('LessonProgress').map((r) => `${r.enrollmentId}/${r.lessonId}`);
  if (new Set(progPairs).size !== progPairs.length) errors.push('LessonProgress (enrollmentId, lessonId) has duplicates');

  // 8. Lesson dates are present (new Lesson.date column).
  for (const row of get('Lesson')) {
    if (row.date === null || row.date === undefined || row.date === '') {
      errors.push(`Lesson ${row.id} has no date`);
    }
  }

  // 9. No leftover placeholders or leaked literals.
  if (sql.includes('***REMOVED***')) errors.push('Seed contains ***REMOVED*** placeholders');
  if (/\bundefined\b/.test(sql)) errors.push('Seed contains an "undefined" literal');
  if (/\bNaN\b/.test(sql)) errors.push('Seed contains a "NaN" literal');

  return { counts, amountPaidTotal, errors, warnings };
}

/** Validate the seed file at a path (reads it from disk). */
export function validateSeedFile(path: string): SeedValidationReport {
  return validateSeedSql(readFileSync(path, 'utf8'));
}
