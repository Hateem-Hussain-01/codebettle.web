/**
 * Forms service (Phase 6 — Forms Builder).
 *
 * The logic behind /api/admin/forms* and /api/forms/[slug]*. No Next.js
 * imports — unit-testable with the fake db. Admin callers are gated at
 * the route by requireAdminArea('forms'); the service still checks the
 * actor has the admin capability, so a direct caller cannot skip the
 * guard. Public submission always validates against the STORED schema
 * (never a client-sent one) and fires the form_submission
 * notification hook (best-effort — a notification failure never
 * blocks the submission).
 */
import {
  countSubmissionsForForm,
  createFormDefinition,
  createFormSubmission,
  deleteFormDefinition,
  getFormDefinitionById,
  getFormDefinitionBySlug,
  getFormSubmissionForForm,
  listFormDefinitions,
  listFormSubmissions,
  updateFormDefinition,
  updateFormSubmissionReviewed,
} from '../db/forms';
import { toCsv } from './csv-export';
import { badRequest, conflict, notFound, type Actor, type ServiceError } from './errors';
import { validateFormSchema, validateSubmissionAgainstSchema } from './form-schema';
import { onFormSubmissionCreated } from './notification-service';
import { hasAdminCapability } from '../rbac';
import type {
  FormDefinition,
  FormSchema,
  FormStatus,
  FormSubmission,
  FormType,
  PublicForm,
} from '../db/types';
import { FORM_STATUSES, FORM_TYPES } from '../db/types';
import type { Page } from '../db/pagination';

type Result<T> = T | ServiceError;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Turn a form name into a URL-safe slug ("Summer Survey 2026" -> "summer-survey-2026"). */
export function slugifyFormName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'form';
}

/** Find a free slug: base, base-2, base-3, ... (excluding one id on update). */
export async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  for (;;) {
    const existing = await getFormDefinitionBySlug(candidate);
    if (!existing || (excludeId !== undefined && existing.id === excludeId)) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

function isFormType(value: unknown): value is FormType {
  return typeof value === 'string' && (FORM_TYPES as readonly string[]).includes(value);
}

function isFormStatus(value: unknown): value is FormStatus {
  return typeof value === 'string' && (FORM_STATUSES as readonly string[]).includes(value);
}

function adminOnly(actor: Actor): ServiceError | null {
  if (!hasAdminCapability(actor)) return { error: 'Admin access required', status: 403 };
  return null;
}

export type FormDefinitionWithCount = FormDefinition & { submissionCount: number };

export interface CreateFormServiceInput {
  name: string;
  slug?: string;
  type: FormType;
  description?: string;
  schema: unknown;
  status?: FormStatus;
}

export async function createFormService(
  actor: Actor,
  input: CreateFormServiceInput,
): Promise<Result<{ form: FormDefinition }>> {
  const denied = adminOnly(actor);
  if (denied) return denied;
  const name = input.name?.trim();
  if (!name) return badRequest('Name is required');
  if (!isFormType(input.type)) {
    return badRequest("Type must be 'registration' or 'survey'");
  }
  if (input.status !== undefined && !isFormStatus(input.status)) {
    return badRequest("Status must be 'draft' or 'published'");
  }
  // Drafts may be created mid-build with no fields yet; only a create
  // that asks for 'published' requires at least one field.
  const schemaCheck = validateFormSchema(input.schema, {
    requireFields: input.status === 'published',
  });
  if (!schemaCheck.ok) {
    return badRequest(`Invalid form schema: ${schemaCheck.errors[0]}`);
  }
  let slug: string;
  if (input.slug !== undefined) {
    slug = input.slug.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      return badRequest('Slug must be URL-safe: lowercase letters, numbers and hyphens only');
    }
    if (await getFormDefinitionBySlug(slug)) {
      return conflict('A form with this slug already exists');
    }
  } else {
    slug = await ensureUniqueSlug(slugifyFormName(name));
  }
  const form = await createFormDefinition({
    name,
    slug,
    type: input.type,
    description: input.description?.trim() || undefined,
    schema: input.schema as FormSchema,
    status: input.status ?? 'draft',
    createdById: actor.id,
  });
  return { form };
}

export async function getFormService(
  actor: Actor,
  id: string,
): Promise<Result<{ form: FormDefinition }>> {
  const denied = adminOnly(actor);
  if (denied) return denied;
  const form = await getFormDefinitionById(id);
  if (!form) return notFound('Form');
  return { form };
}

export async function listFormsService(
  actor: Actor,
  opts: { page?: string | string[]; limit?: string | string[]; status?: string; type?: string },
): Promise<Result<Page<FormDefinitionWithCount>>> {
  const denied = adminOnly(actor);
  if (denied) return denied;
  const page = await listFormDefinitions(opts);
  const items: FormDefinitionWithCount[] = [];
  for (const form of page.items) {
    items.push({ ...form, submissionCount: await countSubmissionsForForm(form.id) });
  }
  return { ...page, items };
}

export interface UpdateFormServiceInput {
  name?: string;
  slug?: string;
  type?: FormType;
  description?: string | null;
  schema?: unknown;
  status?: FormStatus;
}

export async function updateFormService(
  actor: Actor,
  id: string,
  input: UpdateFormServiceInput,
): Promise<Result<{ form: FormDefinition }>> {
  const denied = adminOnly(actor);
  if (denied) return denied;
  const existing = await getFormDefinitionById(id);
  if (!existing) return notFound('Form');
  if (input.name !== undefined && !input.name.trim()) return badRequest('Name is required');
  if (input.type !== undefined && !isFormType(input.type)) {
    return badRequest("Type must be 'registration' or 'survey'");
  }
  if (input.status !== undefined && !isFormStatus(input.status)) {
    return badRequest("Status must be 'draft' or 'published'");
  }
  // The effective status after this update decides the field rule:
  // publishing requires ≥1 field (checked against the effective
  // schema — the incoming one, or the stored one when only the status
  // changes); draft writes may keep an empty field list.
  const resultingStatus = input.status ?? existing.status;
  if (resultingStatus === 'published') {
    const effectiveSchema = input.schema !== undefined ? input.schema : existing.schema;
    const schemaCheck = validateFormSchema(effectiveSchema, { requireFields: true });
    if (!schemaCheck.ok) {
      return badRequest(`Invalid form schema: ${schemaCheck.errors[0]}`);
    }
  } else if (input.schema !== undefined) {
    const schemaCheck = validateFormSchema(input.schema, { requireFields: false });
    if (!schemaCheck.ok) {
      return badRequest(`Invalid form schema: ${schemaCheck.errors[0]}`);
    }
  }
  let slug: string | undefined;
  if (input.slug !== undefined) {
    slug = input.slug.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      return badRequest('Slug must be URL-safe: lowercase letters, numbers and hyphens only');
    }
    const clash = await getFormDefinitionBySlug(slug);
    if (clash && clash.id !== id) {
      return conflict('A form with this slug already exists');
    }
  }
  // NOTE: renaming a form never changes its slug unless the caller
  // passes one explicitly — published URLs stay stable.
  const form = await updateFormDefinition(id, {
    name: input.name?.trim(),
    slug,
    type: input.type,
    description: input.description === null ? null : input.description?.trim() || undefined,
    schema: input.schema as FormSchema | undefined,
    status: input.status,
  });
  if (!form) return notFound('Form');
  return { form };
}

export async function deleteFormService(
  actor: Actor,
  id: string,
): Promise<Result<{ deleted: true }>> {
  const denied = adminOnly(actor);
  if (denied) return denied;
  const existing = await getFormDefinitionById(id);
  if (!existing) return notFound('Form');
  await deleteFormDefinition(id);
  return { deleted: true };
}

/** Public shape of a published form (no internal fields). */
export function toPublicForm(form: FormDefinition): PublicForm {
  return {
    id: form.id,
    name: form.name,
    description: form.description,
    type: form.type,
    schema: form.schema,
  };
}

/** Published forms ONLY — drafts and missing slugs both 404. */
export async function getPublishedFormBySlugService(
  slug: string,
): Promise<Result<{ form: PublicForm }>> {
  const form = await getFormDefinitionBySlug(slug);
  if (!form || form.status !== 'published') return notFound('Form');
  return { form: toPublicForm(form) };
}

export interface SubmitFormResult {
  ok: true;
  submissionId: string;
}

export interface SubmitFormError {
  ok: false;
  status: number;
  error: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Submit a form (public, unauthenticated). Validates the payload
 * against the STORED schema — a client-sent schema is never trusted —
 * stores the submission (submitterId from the session when signed
 * in, else null) and fires the admin notification hook best-effort.
 */
export async function submitFormService(
  slug: string,
  data: unknown,
  submitterId?: string,
): Promise<SubmitFormResult | SubmitFormError> {
  const form = await getFormDefinitionBySlug(slug);
  if (!form || form.status !== 'published') {
    return { ok: false, status: 404, error: 'Form not found' };
  }
  const check = validateSubmissionAgainstSchema(form.schema, data);
  if (!check.ok) {
    return { ok: false, status: 400, error: 'Invalid submission', fieldErrors: check.fieldErrors };
  }
  const submission = await createFormSubmission({
    formId: form.id,
    submitterId: submitterId ?? undefined,
    data: data as Record<string, unknown>,
  });
  // Best-effort: a notification failure never blocks the submission.
  try {
    await onFormSubmissionCreated(form, submission, submitterId);
  } catch (error) {
    console.error('[form-service] onFormSubmissionCreated failed:', error);
  }
  return { ok: true, submissionId: submission.id };
}

export async function listFormSubmissionsService(
  actor: Actor,
  formId: string,
  opts: { page?: string | string[]; limit?: string | string[]; reviewed?: boolean },
): Promise<Result<Page<FormSubmission> & { form: FormDefinition }>> {
  const denied = adminOnly(actor);
  if (denied) return denied;
  const form = await getFormDefinitionById(formId);
  if (!form) return notFound('Form');
  const page = await listFormSubmissions(formId, opts);
  return { ...page, form };
}

export async function getFormSubmissionService(
  actor: Actor,
  formId: string,
  submissionId: string,
): Promise<Result<{ form: FormDefinition; submission: FormSubmission }>> {
  const denied = adminOnly(actor);
  if (denied) return denied;
  const form = await getFormDefinitionById(formId);
  if (!form) return notFound('Form');
  const submission = await getFormSubmissionForForm(formId, submissionId);
  if (!submission) return notFound('Submission');
  return { form, submission };
}

export async function markFormSubmissionReviewedService(
  actor: Actor,
  formId: string,
  submissionId: string,
  reviewed: boolean,
): Promise<Result<{ submission: FormSubmission }>> {
  const denied = adminOnly(actor);
  if (denied) return denied;
  const form = await getFormDefinitionById(formId);
  if (!form) return notFound('Form');
  const submission = await updateFormSubmissionReviewed(submissionId, reviewed);
  if (!submission || submission.formId !== formId) return notFound('Submission');
  return { submission };
}

/** Format one submitted value as a CSV cell (arrays joined, objects JSON). */
function formatSubmissionValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map((v) => String(v)).join('; ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * CSV export data for a form's submissions: header row + one row per
 * submission (all submissions, not just the current page). Columns:
 * Submission ID, Submitted At, Reviewed, Submitter ID, then one
 * column per schema field (in field order, labelled by field label).
 */
export async function exportFormSubmissionsCsvService(
  actor: Actor,
  formId: string,
): Promise<Result<{ csv: string; filename: string }>> {
  const denied = adminOnly(actor);
  if (denied) return denied;
  const form = await getFormDefinitionById(formId);
  if (!form) return notFound('Form');
  // Fetch every submission (paged reads of 100 until exhausted).
  const all: FormSubmission[] = [];
  let page = 1;
  for (;;) {
    const chunk = await listFormSubmissions(formId, { page: String(page), limit: '100' });
    all.push(...chunk.items);
    if (!chunk.hasNext) break;
    page += 1;
  }
  const header = [
    'Submission ID',
    'Submitted At',
    'Reviewed',
    'Submitter ID',
    ...form.schema.fields.map((f) => f.label),
  ];
  const rows = all.map((s) => [
    s.id,
    s.submittedAt,
    s.reviewed ? 'yes' : 'no',
    s.submitterId ?? '',
    ...form.schema.fields.map((f) => formatSubmissionValue(s.data[f.id])),
  ]);
  return {
    csv: toCsv([header, ...rows]),
    filename: `form-${form.slug}-submissions.csv`,
  };
}
