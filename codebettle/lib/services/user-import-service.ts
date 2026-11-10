/**
 * CSV user import service (Phase 4, admin-only).
 *
 * Imports students and instructors from a CSV with columns
 * name, email, role, phone (phone optional). Admin accounts can never be
 * imported. Two steps: preview (validates, writes nothing) then confirm
 * (imports only the preview's valid rows).
 *
 * Imported users get a bcrypt hash of a fresh random value nobody knows —
 * the same unusable-password convention as the seed — so they cannot sign
 * in until an admin sets a password via the existing reset/setup flow.
 * A password column is never accepted: it is rejected as an unknown
 * column, and no password is ever invented. No Next.js imports —
 * unit-testable with the fake db.
 */
import { randomBytes } from 'node:crypto';
import { createUser, getUserByEmail } from '../db/users';
import { logAudit } from '../db/audit';
import { hashPassword, normalizeEmail } from '../security';
import { badRequest, forbidden, type Actor, type ServiceError } from './errors';

type Result<T> = T | ServiceError;

export const MAX_IMPORT_ROWS = 200;
const REQUIRED_COLUMNS = ['name', 'email', 'role'] as const;
const OPTIONAL_COLUMNS = ['phone'] as const;
const ALLOWED_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];
const IMPORTABLE_ROLES = ['student', 'instructor'] as const;

export type ImportableRole = (typeof IMPORTABLE_ROLES)[number];

export interface ValidImportRow {
  line?: number;
  name: string;
  email: string;
  role: ImportableRole;
  phone?: string;
}

export interface InvalidImportRow {
  line: number;
  row: { name: string; email: string; role: string; phone: string };
  errors: string[];
}

export interface ImportPreview {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  valid: ValidImportRow[];
  invalid: InvalidImportRow[];
}

function requireAdmin(actor: Actor): ServiceError | null {
  return actor.role === 'admin' ? null : forbidden('Only admins can import users');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// CSV parsing (small, correct, no dependency)
// ---------------------------------------------------------------------------

export interface ParsedCsvRecord {
  /** 1-based line number the record starts on (header is line 1). */
  line: number;
  fields: string[];
}

/**
 * Parse CSV text into records. Handles quoted fields containing commas,
 * newlines and escaped double-quotes (""), CRLF and LF line endings.
 * Throws on an unterminated quoted field.
 */
export function parseCsv(text: string): ParsedCsvRecord[] {
  const records: ParsedCsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let recordStartLine = 1;
  let line = 1;
  let fieldStarted = false;

  const endField = () => {
    fields.push(field);
    field = '';
    fieldStarted = false;
  };
  const endRecord = () => {
    endField();
    records.push({ line: recordStartLine, fields });
    fields = [];
    recordStartLine = line + 1;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      if (field === '' && !fieldStarted) {
        inQuotes = true;
        fieldStarted = true;
      } else {
        // A quote mid-field is kept literally (lenient, like most parsers).
        field += ch;
      }
      continue;
    }
    if (ch === ',') {
      endField();
      continue;
    }
    if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      endRecord();
      line++;
      continue;
    }
    if (ch === '\n') {
      endRecord();
      line++;
      continue;
    }
    field += ch;
    fieldStarted = true;
  }
  if (inQuotes) throw new Error('Unterminated quoted field in CSV');
  // A trailing record without a newline (and any non-empty trailing field).
  if (fields.length > 0 || field !== '' || fieldStarted) endRecord();
  return records;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateRow(
  fields: Record<string, string>,
  line: number,
  seenEmails: Set<string>,
): { valid: ValidImportRow | null; invalid: InvalidImportRow | null } {
  const errors: string[] = [];
  const name = (fields.name ?? '').trim();
  const emailRaw = (fields.email ?? '').trim();
  const email = normalizeEmail(emailRaw);
  const role = (fields.role ?? '').trim().toLowerCase();
  const phone = (fields.phone ?? '').trim();

  if (!name) errors.push('Name is required');
  if (!emailRaw) {
    errors.push('Email is required');
  } else if (!EMAIL_RE.test(emailRaw)) {
    errors.push(`Email "${emailRaw}" is not a valid email address`);
  }
  if (!role) {
    errors.push('Role is required');
  } else if (role === 'admin') {
    errors.push('Admin accounts cannot be imported');
  } else if (role !== 'student' && role !== 'instructor') {
    errors.push(`Role "${role}" is not valid (must be student or instructor)`);
  }
  if (email && EMAIL_RE.test(emailRaw)) {
    if (seenEmails.has(email)) errors.push(`Duplicate email "${email}" in this file`);
    else seenEmails.add(email);
  }

  const row = { name, email: emailRaw, role, phone };
  if (errors.length > 0) return { valid: null, invalid: { line, row, errors } };
  return {
    valid: { line, name, email, role: role as ImportableRole, ...(phone ? { phone } : {}) },
    invalid: null,
  };
}

// ---------------------------------------------------------------------------
// Preview (writes nothing)
// ---------------------------------------------------------------------------

export async function previewUserImport(
  actor: Actor,
  csv: string,
): Promise<Result<ImportPreview>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  if (typeof csv !== 'string' || csv.trim() === '') {
    return badRequest('CSV file is empty');
  }
  let records: ParsedCsvRecord[];
  try {
    records = parseCsv(csv);
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : 'Could not parse CSV');
  }
  if (records.length === 0) return badRequest('CSV file is empty');
  const header = records[0].fields.map((h) => h.trim().toLowerCase());
  const unknown = header.filter((h) => h !== '' && !ALLOWED_COLUMNS.includes(h as (typeof ALLOWED_COLUMNS)[number]));
  if (unknown.length > 0) {
    return badRequest(`Unknown column(s): ${unknown.join(', ')} (allowed: ${ALLOWED_COLUMNS.join(', ')})`);
  }
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    return badRequest(`Missing required column(s): ${missing.join(', ')} (header must be: ${ALLOWED_COLUMNS.join(', ')})`);
  }
  if (new Set(header).size !== header.length) {
    return badRequest('Duplicate column in header');
  }

  const dataRecords = records.slice(1).filter((r) => r.fields.some((f) => f.trim() !== ''));
  if (dataRecords.length > MAX_IMPORT_ROWS) {
    return badRequest(`CSV has ${dataRecords.length} rows, more than the maximum of ${MAX_IMPORT_ROWS}`);
  }

  const valid: ValidImportRow[] = [];
  const invalid: InvalidImportRow[] = [];
  const seenEmails = new Set<string>();
  for (const record of dataRecords) {
    const fields: Record<string, string> = {};
    header.forEach((col, i) => {
      fields[col] = record.fields[i] ?? '';
    });
    const errors: string[] = [];
    if (record.fields.length > header.length) {
      errors.push(`Expected ${header.length} columns, found ${record.fields.length}`);
    }
    const { valid: validRow, invalid: invalidRow } = validateRow(fields, record.line, seenEmails);
    if (invalidRow) {
      invalid.push({ ...invalidRow, errors: [...errors, ...invalidRow.errors] });
    } else if (errors.length > 0) {
      invalid.push({
        line: record.line,
        row: { name: fields.name?.trim() ?? '', email: fields.email?.trim() ?? '', role: fields.role?.trim() ?? '', phone: fields.phone?.trim() ?? '' },
        errors,
      });
    } else if (validRow) {
      // Email must also be unique against the database.
      const existing = await getUserByEmail(validRow.email);
      if (existing) {
        invalid.push({
          line: record.line,
          row: { name: validRow.name, email: validRow.email, role: validRow.role, phone: validRow.phone ?? '' },
          errors: [`Email "${validRow.email}" already exists`],
        });
      } else {
        valid.push(validRow);
      }
    }
  }

  return {
    totalRows: dataRecords.length,
    validCount: valid.length,
    invalidCount: invalid.length,
    valid,
    invalid,
  };
}

// ---------------------------------------------------------------------------
// Confirm (imports only the preview's valid rows)
// ---------------------------------------------------------------------------

export interface ImportResult {
  importedCount: number;
  skippedCount: number;
  imported: Array<{ id: string; email: string }>;
}

export async function importUsers(
  actor: Actor,
  validRows: ValidImportRow[],
): Promise<Result<ImportResult>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  if (!Array.isArray(validRows) || validRows.length === 0) {
    return badRequest('No valid rows to import — preview the CSV first');
  }
  if (validRows.length > MAX_IMPORT_ROWS) {
    return badRequest(`Cannot import more than ${MAX_IMPORT_ROWS} rows at once`);
  }
  const imported: Array<{ id: string; email: string }> = [];
  let skippedCount = 0;
  for (const row of validRows) {
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const email = typeof row.email === 'string' ? normalizeEmail(row.email) : '';
    const role = row.role;
    if (!name || !EMAIL_RE.test(email) || (role !== 'student' && role !== 'instructor')) {
      skippedCount++;
      continue;
    }
    // Re-check the database at import time: an account may have been
    // created since the preview. Skipped, not an error — the rest still import.
    const existing = await getUserByEmail(email);
    if (existing) {
      skippedCount++;
      continue;
    }
    const user = await createUser({
      name,
      email,
      // Unusable password: a bcrypt hash of a random value nobody knows.
      // The user cannot sign in until an admin sets a password.
      passwordHash: await hashPassword(randomBytes(32).toString('hex')),
      role,
      ...(row.phone ? { phone: row.phone.trim() } : {}),
    });
    imported.push({ id: user.id, email: user.email });
  }
  await logAudit({
    actorId: actor.id,
    action: 'user.import',
    entity: 'user',
    detail: `Imported ${imported.length} users via CSV (${skippedCount} skipped)`,
  });
  return { importedCount: imported.length, skippedCount, imported };
}
