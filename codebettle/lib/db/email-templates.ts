/**
 * Email-template repository (admin email builder).
 *
 * Fail-safe by design: when the EmailTemplate table has not been
 * created yet (the SQL migration has not run), every read/write
 * throws an EmailTemplateTableMissingError instead of crashing the
 * caller with a raw Postgres error. API routes catch it with
 * isEmailTemplateTableMissing() and the builder UI shows a
 * "run the SQL" state. Nothing else on the site touches this table,
 * so the rest of the app is unaffected.
 */
import { getDb } from './client';
import { mapEmailTemplateRow } from './mappers';
import type { EmailTemplate, EmailTemplateType } from './types';

export const EMAIL_TEMPLATE_TABLE_MISSING = 'EMAIL_TEMPLATE_TABLE_MISSING';

/** Thrown when the EmailTemplate table does not exist yet. */
export class EmailTemplateTableMissingError extends Error {
  readonly code = EMAIL_TEMPLATE_TABLE_MISSING;
  constructor() {
    super('EmailTemplate table does not exist yet — run the email-template SQL migration');
    this.name = 'EmailTemplateTableMissingError';
  }
}

/**
 * True when the error is a missing EmailTemplate table (Postgres
 * 42P01 undefined_table, or the relation name in the message).
 * Same shape as isMissingColumnError in lib/db/certificates.ts.
 */
export function isEmailTemplateTableMissing(error: unknown): boolean {
  if (error instanceof EmailTemplateTableMissingError) return true;
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';
  if (code === '42P01' && text.includes('EmailTemplate')) return true;
  return /relation .*EmailTemplate.* does not exist/i.test(text);
}

function toMissingTable<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    if (isEmailTemplateTableMissing(error)) throw new EmailTemplateTableMissingError();
    throw error;
  });
}

export async function listEmailTemplates(): Promise<EmailTemplate[]> {
  return toMissingTable(async () => {
    const rows = await getDb()
      .orm.public.EmailTemplate.orderBy((t) => t.createdAt.desc())
      .all();
    return rows.map((r) => mapEmailTemplateRow(r));
  });
}

/** Active templates only — the ones offered in the broadcast picker. */
export async function listActiveEmailTemplates(): Promise<EmailTemplate[]> {
  const all = await listEmailTemplates();
  return all.filter((t) => t.isActive);
}

export async function getEmailTemplateById(id: string): Promise<EmailTemplate | null> {
  return toMissingTable(async () => {
    const row = await getDb().orm.public.EmailTemplate.where({ id }).first();
    if (!row) return null;
    return mapEmailTemplateRow(row);
  });
}

export interface CreateEmailTemplateInput {
  name: string;
  subject: string;
  htmlBody: string;
  type?: EmailTemplateType;
  isActive?: boolean;
  createdById: string;
}

export async function createEmailTemplate(
  input: CreateEmailTemplateInput,
): Promise<EmailTemplate> {
  return toMissingTable(async () => {
    const row = await getDb().orm.public.EmailTemplate.create({
      name: input.name,
      subject: input.subject,
      htmlBody: input.htmlBody,
      type: input.type ?? 'broadcast',
      isActive: input.isActive ?? true,
      createdById: input.createdById,
    });
    return mapEmailTemplateRow(row);
  });
}

export interface UpdateEmailTemplateInput {
  name?: string;
  subject?: string;
  htmlBody?: string;
  type?: EmailTemplateType;
  isActive?: boolean;
}

export async function updateEmailTemplate(
  id: string,
  input: UpdateEmailTemplateInput,
): Promise<EmailTemplate | null> {
  return toMissingTable(async () => {
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.subject !== undefined) data.subject = input.subject;
    if (input.htmlBody !== undefined) data.htmlBody = input.htmlBody;
    if (input.type !== undefined) data.type = input.type;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    const row = await getDb().orm.public.EmailTemplate.where({ id }).update(data);
    if (!row) return null;
    return getEmailTemplateById(id);
  });
}

export async function deleteEmailTemplate(id: string): Promise<boolean> {
  return toMissingTable(async () => {
    const row = await getDb().orm.public.EmailTemplate.where({ id }).delete();
    return row !== null;
  });
}
