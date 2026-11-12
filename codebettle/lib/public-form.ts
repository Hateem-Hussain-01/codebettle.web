/**
 * Public form rendering — shared types + client-side validation
 * (Phase 6, Worker C — public rendering only).
 *
 * These types mirror the API contract exactly (Worker A owns the API):
 *   GET  /api/forms/[slug]        -> { form: PublicForm } (published only; 404 otherwise)
 *   POST /api/forms/[slug]/submit -> { data } -> { ok: true, submissionId }
 *                                  400 { error, fieldErrors } (per-field
 *                                  messages keyed by field id), 429 when
 *                                  rate-limited
 *
 * Notes vs the brief's contract wording, verified against Worker A's
 * live routes (app/api/forms/[slug]/route.ts, .../submit/route.ts):
 * - The 400 body carries `fieldErrors`, not `errors` (both are read).
 * - Success message / submit-button text live inside `schema`
 *   (schema.successMessage / schema.submitButtonText) — the builder
 *   stores them there and the public API passes the stored schema
 *   through wholesale.
 * - Checkbox with options is a multi-select (value: string[]); without
 *   options it is a single boolean. A required single checkbox is
 *   treated as "must be checked" here even though the server's
 *   isEmptyValue lets `false` through — an unchecked "I agree" box
 *   should not submit.
 *
 * Client validation here is UX only: the POST endpoint validates every
 * submission against the stored schema server-side. This module just
 * mirrors the schema rules so the visitor gets inline errors before
 * submitting — it must never be treated as the enforcement point.
 */

/**
 * Canonical form types live in `lib/forms.ts` (admin-shared, client-safe)
 * and `lib/db/types.ts` (server). This module aliases them instead of
 * redefining them, so a type change in one place reaches the public
 * renderer. `PublicFormField` keeps its own shape only because its
 * options defensively accept `{ value, label }` objects as well as
 * plain strings (see normalizeFieldOptions).
 */
import type { FormFieldType, FormFieldValidation, FormSchema } from './forms';
import {
  uploadVariantConfig,
  type UploadVariant,
} from './form-uploads';

export type PublicFormFieldType = FormFieldType;

export interface PublicFormFieldOption {
  value: string;
  label: string;
}

export type PublicFormFieldValidation = FormFieldValidation;

export interface PublicFormField {
  id: string;
  type: PublicFormFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  /** String options render as value = label; object options use value/label. */
  options?: (string | PublicFormFieldOption)[];
  validation?: PublicFormFieldValidation;
  styling?: { width?: 'full' | 'half' };
  /** File fields only: upload variant (default 'files'). */
  uploadVariant?: UploadVariant;
}

/**
 * The public schema is the stored `FormSchema` (which carries the
 * form-level settings) with the defensive public field shape.
 */
export interface PublicFormSchema extends Omit<FormSchema, 'fields'> {
  fields: PublicFormField[];
}

export interface PublicForm {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  schema: PublicFormSchema;
  /**
   * NOT in the API contract — read opportunistically only. If Worker A
   * adds form-level settings (e.g. a custom success message), the public
   * page honours them; otherwise the default below is used.
   */
  settings?: { successMessage?: string };
}

export const DEFAULT_SUCCESS_MESSAGE =
  'Thank you! Your response has been submitted.';

export const DEFAULT_SUBMIT_BUTTON_TEXT = 'Submit';

/**
 * Custom success message when the form carries one — first from
 * `schema.successMessage` (where the builder stores it), then from a
 * top-level `settings` object if Worker A ever adds one — else the
 * default. The brief's contract lists no settings shape, so both
 * locations are read opportunistically.
 */
export function getSuccessMessage(form: PublicForm): string {
  const custom =
    form.schema?.successMessage?.trim() ?? form.settings?.successMessage?.trim();
  return custom ? custom : DEFAULT_SUCCESS_MESSAGE;
}

/** Custom submit-button text from `schema.submitButtonText`, else 'Submit'. */
export function getSubmitButtonText(form: PublicForm): string {
  const custom = form.schema?.submitButtonText?.trim();
  return custom ? custom : DEFAULT_SUBMIT_BUTTON_TEXT;
}

/**
 * Normalise a field's options to { value, label } pairs. Plain strings
 * become value = label; objects pass through. Unknown shapes are dropped
 * rather than rendered.
 */
export function normalizeFieldOptions(field: PublicFormField): PublicFormFieldOption[] {
  const raw = field.options ?? [];
  const out: PublicFormFieldOption[] = [];
  for (const opt of raw) {
    if (typeof opt === 'string') {
      if (opt !== '') out.push({ value: opt, label: opt });
    } else if (opt && typeof opt.value === 'string' && typeof opt.label === 'string') {
      out.push({ value: opt.value, label: opt.label });
    }
  }
  return out;
}

/** True when a value counts as "not filled in" for this field type. */
export function isFieldEmpty(field: PublicFormField, value: unknown): boolean {
  if (field.type === 'file') {
    // A chosen File is filled in; null/undefined/'' is not.
    return value === undefined || value === null || value === '';
  }
  if (field.type === 'checkbox') {
    // Multi-checkbox (with options): an array of chosen options — empty
    // when nothing is chosen. Single checkbox (no options): a boolean.
    if (field.options && field.options.length > 0) {
      return !Array.isArray(value) || value.length === 0;
    }
    return value !== true;
  }
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate one field value against its schema rules.
 * Returns the error message, or null when the value is acceptable.
 * An empty optional field always passes — only `required` rejects it.
 */
export function validateFieldValue(field: PublicFormField, value: unknown): string | null {
  if (isFieldEmpty(field, value)) {
    return field.required ? 'This field is required.' : null;
  }

  if (field.type === 'file') {
    // Client-side hint only — the server re-checks type, size and
    // contents on upload. A File object is what the picker produces.
    if (typeof File !== 'undefined' && value instanceof File) {
      const config = uploadVariantConfig(field.uploadVariant);
      if (!value.type || !(config.mimes as readonly string[]).includes(value.type)) {
        return `Only ${config.description}.`;
      }
      if (value.size > config.maxBytes) {
        return 'The file must be 5 MB or smaller.';
      }
    }
    return null;
  }

  if (field.type === 'checkbox') {
    // Single checkbox: non-empty means checked (see isFieldEmpty).
    // Multi-checkbox: every chosen option must be one of the options.
    if (field.options && field.options.length > 0) {
      const allowed = normalizeFieldOptions(field).map((o) => o.value);
      const chosen = Array.isArray(value) ? value : [];
      if (chosen.some((entry) => typeof entry !== 'string' || !allowed.includes(entry))) {
        return 'Choose one of the listed options.';
      }
    }
    return null;
  }

  const str = String(value);

  if (field.type === 'email' && !EMAIL_RE.test(str.trim())) {
    return 'Enter a valid email address.';
  }

  const v = field.validation ?? {};
  if (v.minLength !== undefined && str.length < v.minLength) {
    return `Enter at least ${v.minLength} characters.`;
  }
  if (v.maxLength !== undefined && str.length > v.maxLength) {
    return `Enter no more than ${v.maxLength} characters.`;
  }
  if (v.pattern) {
    let re: RegExp;
    try {
      re = new RegExp(v.pattern);
    } catch {
      // An unparseable pattern is a server-side schema problem, not the
      // visitor's fault — skip the client check; the server enforces it.
      return null;
    }
    if (!re.test(str)) return 'Enter a value in the required format.';
  }

  if (field.type === 'number') {
    const num = Number(str);
    if (Number.isNaN(num)) return 'Enter a valid number.';
    if (v.min !== undefined && num < v.min) return `Enter a number of at least ${v.min}.`;
    if (v.max !== undefined && num > v.max) return `Enter a number of no more than ${v.max}.`;
  }

  if (field.type === 'select' || field.type === 'radio') {
    const allowed = normalizeFieldOptions(field).map((o) => o.value);
    if (!allowed.includes(str)) return 'Choose one of the listed options.';
  }

  return null;
}

/** Validate a whole submission; returns per-field errors (empty when valid). */
export function validateFormData(
  fields: PublicFormField[],
  data: Record<string, unknown>
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const err = validateFieldValue(field, data[field.id]);
    if (err) errors[field.id] = err;
  }
  return errors;
}

/** Initial (empty) values: '' for inputs, false for a single checkbox, [] for a multi-checkbox, null for a file field. */
export function emptyFormData(fields: PublicFormField[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    data[field.id] =
      field.type === 'file'
        ? null
        : field.type === 'checkbox'
          ? field.options && field.options.length > 0
            ? []
            : false
          : '';
  }
  return data;
}

/**
 * Shape the payload for POST /api/forms/[slug]/submit: number fields are
 * sent as numbers (when filled in and numeric), everything else as-is.
 * File fields are EXCLUDED — the client sends them as `file:<fieldId>`
 * parts of a multipart request instead (prepareSubmitData only builds
 * the JSON `data` part). The server still validates every value
 * against the stored schema.
 */
export function prepareSubmitData(
  fields: PublicFormField[],
  data: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === 'file') continue;
    const value = data[field.id];
    if (field.type === 'number' && typeof value === 'string' && value.trim() !== '') {
      const num = Number(value);
      out[field.id] = Number.isNaN(num) ? value : num;
    } else {
      out[field.id] = value;
    }
  }
  return out;
}

/** True when the form has at least one file field (submit as multipart). */
export function hasFileFields(fields: PublicFormField[]): boolean {
  return fields.some((f) => f.type === 'file');
}

/** The browser `accept` attribute for a file field (UX hint only). */
export function fileAcceptForField(field: PublicFormField): string {
  return uploadVariantConfig(field.uploadVariant).accept;
}

/** The chosen File objects, keyed by field id (for the multipart submit). */
export function fileValues(
  fields: PublicFormField[],
  data: Record<string, unknown>,
): Record<string, File> {
  const out: Record<string, File> = {};
  for (const field of fields) {
    if (field.type !== 'file') continue;
    const value = data[field.id];
    if (typeof File !== 'undefined' && value instanceof File) out[field.id] = value;
  }
  return out;
}

export type SubmitOutcome =
  | { outcome: 'success'; submissionId?: string }
  | { outcome: 'field-errors'; errors: Record<string, string> }
  | { outcome: 'rate-limited' }
  | { outcome: 'error' };

/**
 * Interpret a submit response (status + parsed JSON body) into the state
 * the form shows. Pure, so the success / 400 / 429 branches are unit
 * tested without a DOM. A network failure never reaches this function —
 * the client shows the network message for a thrown fetch.
 */
export function interpretSubmitResponse(
  status: number,
  body: unknown
): SubmitOutcome {
  if (status >= 200 && status < 300) {
    const submissionId =
      body && typeof body === 'object' && 'submissionId' in body
        ? String((body as { submissionId: unknown }).submissionId)
        : undefined;
    return { outcome: 'success', submissionId };
  }
  if (status === 400) {
    // The live route answers 400 with `fieldErrors` (the brief's
    // contract wording said `errors` — accept both).
    const bodyObj = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const raw = bodyObj.fieldErrors ?? bodyObj.errors;
    const errors =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, string>)
        : {};
    return { outcome: 'field-errors', errors };
  }
  if (status === 429) return { outcome: 'rate-limited' };
  return { outcome: 'error' };
}
