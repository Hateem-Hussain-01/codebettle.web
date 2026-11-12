/**
 * Forms repository (Phase 6 — Forms Builder, Prisma-backed).
 *
 * Form definitions are admin-created content; submissions are public
 * (anonymous allowed — submitterId is null when signed out). Every
 * admin read/write is gated at the route by requireAdminArea('forms');
 * the public submit route only ever touches the one published form
 * named by its slug and validates the payload against that form's
 * STORED schema (see lib/services/form-schema.ts) — a client-sent
 * schema is never trusted.
 */
import { getDb } from './client';
import { mapFormDefinitionRow, mapFormSubmissionRow } from './mappers';
import { parsePageParams, toPage, type Page } from './pagination';
import type {
  FormDefinition,
  FormSchema,
  FormStatus,
  FormSubmission,
  FormType,
} from './types';

export interface CreateFormDefinitionInput {
  name: string;
  slug: string;
  type: FormType;
  description?: string;
  schema: FormSchema;
  status?: FormStatus;
  createdById: string;
}

export async function createFormDefinition(
  input: CreateFormDefinitionInput,
): Promise<FormDefinition> {
  const row = await getDb().orm.public.FormDefinition.create({
    name: input.name,
    slug: input.slug,
    type: input.type,
    description: input.description ?? null,
    // JSON round-trip so the stored value is plain JSON.
    schema: JSON.parse(JSON.stringify(input.schema)),
    status: input.status ?? 'draft',
    createdById: input.createdById,
  });
  return mapFormDefinitionRow(row);
}

export async function getFormDefinitionById(id: string): Promise<FormDefinition | null> {
  const row = await getDb().orm.public.FormDefinition.where({ id }).first();
  if (!row) return null;
  return mapFormDefinitionRow(row);
}

export async function getFormDefinitionBySlug(slug: string): Promise<FormDefinition | null> {
  const row = await getDb().orm.public.FormDefinition.where({ slug }).first();
  if (!row) return null;
  return mapFormDefinitionRow(row);
}

export interface ListFormDefinitionsOptions {
  page?: string | string[];
  limit?: string | string[];
  status?: string;
  type?: string;
}

/** All form definitions (admin), newest first, paginated, with optional filters. */
export async function listFormDefinitions(
  opts: ListFormDefinitionsOptions = {},
): Promise<Page<FormDefinition>> {
  const params = parsePageParams({ page: opts.page, limit: opts.limit });
  let query = getDb().orm.public.FormDefinition;
  if (opts.status) query = query.where({ status: opts.status });
  if (opts.type) query = query.where({ type: opts.type });
  const total = (await query.all()).length;
  const rows = await query
    .orderBy((r) => r.createdAt.desc())
    .limit(params.limit)
    .offset(params.offset)
    .all();
  return toPage(rows.map(mapFormDefinitionRow), total, params);
}

export interface UpdateFormDefinitionInput {
  name?: string;
  slug?: string;
  type?: FormType;
  description?: string | null;
  schema?: FormSchema;
  status?: FormStatus;
}

/** Update a form definition. Returns the updated row, or null when it does not exist. */
export async function updateFormDefinition(
  id: string,
  input: UpdateFormDefinitionInput,
): Promise<FormDefinition | null> {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.type !== undefined) data.type = input.type;
  if (input.description !== undefined) data.description = input.description;
  if (input.schema !== undefined) data.schema = JSON.parse(JSON.stringify(input.schema));
  if (input.status !== undefined) data.status = input.status;
  const row = await getDb().orm.public.FormDefinition.where({ id }).update(data);
  if (!row) return null;
  return getFormDefinitionById(id);
}

/**
 * Delete a form definition and its submissions. The database cascades
 * submissions (ON DELETE CASCADE), but the delete is done explicitly
 * here too so the behaviour is identical on stores without cascade
 * support (e.g. the in-memory test fake).
 */
export async function deleteFormDefinition(id: string): Promise<boolean> {
  await getDb().orm.public.FormSubmission.where({ formId: id }).deleteAll();
  const row = await getDb().orm.public.FormDefinition.where({ id }).delete();
  return row !== null;
}

export interface CreateFormSubmissionInput {
  formId: string;
  submitterId?: string;
  data: Record<string, unknown>;
}

export async function createFormSubmission(
  input: CreateFormSubmissionInput,
): Promise<FormSubmission> {
  const row = await getDb().orm.public.FormSubmission.create({
    formId: input.formId,
    submitterId: input.submitterId ?? null,
    data: JSON.parse(JSON.stringify(input.data)),
    reviewed: false,
  });
  return mapFormSubmissionRow(row);
}

/** One submission, admin view (no scoping — the route is admin-only). */
export async function getFormSubmissionById(id: string): Promise<FormSubmission | null> {
  const row = await getDb().orm.public.FormSubmission.where({ id }).first();
  if (!row) return null;
  return mapFormSubmissionRow(row);
}

/** One submission, only when it belongs to this form (null otherwise). */
export async function getFormSubmissionForForm(
  formId: string,
  submissionId: string,
): Promise<FormSubmission | null> {
  const row = await getDb().orm.public.FormSubmission.where({ id: submissionId, formId }).first();
  if (!row) return null;
  return mapFormSubmissionRow(row);
}

export interface ListFormSubmissionsOptions {
  page?: string | string[];
  limit?: string | string[];
  /** When set, return only reviewed / only unreviewed submissions. */
  reviewed?: boolean;
}

/** A form's submissions, newest first, paginated, with an optional reviewed filter. */
export async function listFormSubmissions(
  formId: string,
  opts: ListFormSubmissionsOptions = {},
): Promise<Page<FormSubmission>> {
  const params = parsePageParams({ page: opts.page, limit: opts.limit });
  let query = getDb().orm.public.FormSubmission.where({ formId });
  if (opts.reviewed !== undefined) query = query.where({ reviewed: opts.reviewed });
  const total = (await query.all()).length;
  const rows = await query
    .orderBy((r) => r.submittedAt.desc())
    .limit(params.limit)
    .offset(params.offset)
    .all();
  return toPage(rows.map(mapFormSubmissionRow), total, params);
}

/** Mark a submission reviewed / unreviewed. Returns the updated row, or null. */
export async function updateFormSubmissionReviewed(
  id: string,
  reviewed: boolean,
): Promise<FormSubmission | null> {
  const row = await getDb().orm.public.FormSubmission.where({ id }).update({ reviewed });
  if (!row) return null;
  return getFormSubmissionById(id);
}

/** How many submissions a form has (used for admin list counts). */
export async function countSubmissionsForForm(formId: string): Promise<number> {
  return (await getDb().orm.public.FormSubmission.where({ formId }).all()).length;
}
