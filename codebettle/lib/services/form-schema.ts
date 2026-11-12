/**
 * Form-schema validation helpers (Phase 6 — Forms Builder).
 *
 * Pure functions — no database access, unit-testable. Two validators:
 *
 * - validateFormSchema(schema, opts?): checks a form DEFINITION's shape
 *   (field ids unique, types from the allowed list, select/radio
 *   require non-empty options, checkbox options are optional — a
 *   checkbox without options is a single boolean — validation rules
 *   sane). Called on every admin create/update, so no invalid schema is
 *   ever stored. `opts.requireFields` (default true) requires at least
 *   one field: the service passes false for draft writes (a form may
 *   be saved mid-build with no fields yet) and true when publishing.
 * - validateSubmissionAgainstSchema(schema, data): checks a
 *   SUBMISSION against the STORED schema (never a client-sent one):
 *   required fields present, per-field type checks (email format,
 *   number range, valid date, select/radio value in options,
 *   checkbox boolean or array-of-options, minLength/maxLength/
 *   pattern). Unknown/extra fields are REJECTED — a tampered
 *   payload that invents fields the form does not have fails.
 *
 * Both return { ok: true } or { ok: false, errors } — the submission
 * validator returns per-field errors ({ [fieldId]: message }) so the
 * public submit route can answer 400 with field-level detail.
 */
import {
  FORM_FIELD_TYPES,
  type FormField,
  type FormFieldType,
  type FormSchema,
} from '../db/types';
import { validateCoverImageUrlValue, validateFormStyleValue } from '../form-style';
import {
  fileExtensionOf,
  isFileReference,
  isFormUploadPath,
  isUploadVariant,
  MIME_TO_EXTENSION,
  uploadVariantConfig,
} from '../form-uploads';

export type SchemaValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export type SubmissionValidationResult =
  | { ok: true }
  | { ok: false; fieldErrors: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Is this value "empty" for required-field purposes? */
function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Validate a form definition's schema shape. Accepts unknown input
 * (the admin route passes the raw body) and type-narrows on success.
 */
export function validateFormSchema(
  schema: unknown,
  opts?: { requireFields?: boolean },
): SchemaValidationResult {
  const errors: string[] = [];
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    return { ok: false, errors: ['Schema must be an object with a fields array'] };
  }
  const raw = schema as Record<string, unknown>;
  if (!Array.isArray(raw.fields)) {
    return { ok: false, errors: ['Schema must have a fields array'] };
  }
  const fields = raw.fields as unknown[];
  // A draft may be saved mid-build with no fields yet; only publishing
  // requires at least one field. Default is strict (requireFields true).
  if (fields.length === 0 && opts?.requireFields !== false) {
    errors.push('A form must have at least one field');
  }
  // Form-level settings travel inside the schema (the builder writes
  // them there); they must be strings when present.
  for (const key of ['submitButtonText', 'successMessage'] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') {
      errors.push(`Schema ${key} must be a string`);
    }
  }
  // GHL upgrade: whole-form style + cover image also travel inside the
  // schema. Colours must be strict 6-digit hex (anything else — url(,
  // expression(, gradients, named colours — is rejected, so no CSS
  // injection can reach an inline style); enums are whitelisted; the
  // cover URL must be http(s) or a same-origin path.
  errors.push(...validateFormStyleValue(raw.style));
  errors.push(...validateCoverImageUrlValue(raw.coverImageUrl));
  const seenIds = new Set<string>();
  fields.forEach((item, index) => {
    const where = `Field ${index + 1}`;
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    const f = item as Record<string, unknown>;
    if (typeof f.id !== 'string' || f.id.trim() === '') {
      errors.push(`${where}: id is required`);
    } else if (seenIds.has(f.id)) {
      errors.push(`${where}: duplicate field id "${f.id}"`);
    } else {
      seenIds.add(f.id);
    }
    if (typeof f.type !== 'string' || !(FORM_FIELD_TYPES as readonly string[]).includes(f.type)) {
      errors.push(`${where}: type must be one of ${FORM_FIELD_TYPES.join(', ')}`);
    }
    // A file field's variant, when present, must be one of the four
    // upload variants (absent means 'files' — the server default).
    if (f.type === 'file' && f.uploadVariant !== undefined && !isUploadVariant(f.uploadVariant)) {
      errors.push(`${where}: uploadVariant must be one of picture, document, video, files`);
    }
    if (typeof f.label !== 'string' || f.label.trim() === '') {
      errors.push(`${where}: label is required`);
    }
    if (f.required !== undefined && typeof f.required !== 'boolean') {
      errors.push(`${where}: required must be a boolean`);
    }
    if (f.placeholder !== undefined && typeof f.placeholder !== 'string') {
      errors.push(`${where}: placeholder must be a string`);
    }
    // Options: select/radio REQUIRE a non-empty options array. A
    // checkbox may go either way — without options it is a single
    // boolean ("I agree"); with options it is a multi-select. When
    // options are present on any type they must be non-empty strings.
    if (f.type === 'select' || f.type === 'radio') {
      if (
        !Array.isArray(f.options) ||
        f.options.length === 0 ||
        !f.options.every((o) => typeof o === 'string' && o.trim() !== '')
      ) {
        errors.push(`${where}: ${String(f.type)} fields require a non-empty options array`);
      }
    } else if (f.options !== undefined) {
      if (
        !Array.isArray(f.options) ||
        f.options.length === 0 ||
        !f.options.every((o) => typeof o === 'string' && o.trim() !== '')
      ) {
        errors.push(`${where}: options must be a non-empty array of non-empty strings`);
      }
    }
    if (f.validation !== undefined) {
      if (f.validation === null || typeof f.validation !== 'object' || Array.isArray(f.validation)) {
        errors.push(`${where}: validation must be an object`);
      } else {
        const v = f.validation as Record<string, unknown>;
        for (const key of ['minLength', 'maxLength', 'min', 'max'] as const) {
          if (v[key] !== undefined && (typeof v[key] !== 'number' || !Number.isFinite(v[key]))) {
            errors.push(`${where}: validation.${key} must be a number`);
          }
        }
        if (
          typeof v.minLength === 'number' &&
          typeof v.maxLength === 'number' &&
          v.minLength > v.maxLength
        ) {
          errors.push(`${where}: validation.minLength must not exceed maxLength`);
        }
        if (typeof v.min === 'number' && typeof v.max === 'number' && v.min > v.max) {
          errors.push(`${where}: validation.min must not exceed max`);
        }
        if (v.pattern !== undefined) {
          if (typeof v.pattern !== 'string') {
            errors.push(`${where}: validation.pattern must be a string`);
          } else {
            try {
              new RegExp(v.pattern);
            } catch {
              errors.push(`${where}: validation.pattern is not a valid regular expression`);
            }
          }
        }
      }
    }
    if (f.styling !== undefined) {
      if (f.styling === null || typeof f.styling !== 'object' || Array.isArray(f.styling)) {
        errors.push(`${where}: styling must be an object`);
      } else {
        const width = (f.styling as Record<string, unknown>).width;
        if (width !== undefined && width !== 'full' && width !== 'half') {
          errors.push(`${where}: styling.width must be "full" or "half"`);
        }
      }
    }
  });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}

/** Check one submitted value against one field. Returns an error message or null. */
function validateFieldValue(field: FormField, value: unknown): string | null {
  const label = field.label;
  const v = field.validation ?? {};
  switch (field.type) {
    case 'text':
    case 'tel':
    case 'textarea':
    case 'password': {
      if (typeof value !== 'string') return `${label} must be text`;
      if (v.minLength !== undefined && value.length < v.minLength) {
        return `${label} must be at least ${v.minLength} characters`;
      }
      if (v.maxLength !== undefined && value.length > v.maxLength) {
        return `${label} must be at most ${v.maxLength} characters`;
      }
      if (v.pattern !== undefined) {
        let re: RegExp;
        try {
          re = new RegExp(v.pattern);
        } catch {
          return `${label} could not be validated`;
        }
        if (!re.test(value)) return `${label} is not in the required format`;
      }
      return null;
    }
    case 'email': {
      if (typeof value !== 'string') return `${label} must be an email address`;
      if (!EMAIL_RE.test(value)) return `${label} must be a valid email address`;
      if (v.minLength !== undefined && value.length < v.minLength) {
        return `${label} must be at least ${v.minLength} characters`;
      }
      if (v.maxLength !== undefined && value.length > v.maxLength) {
        return `${label} must be at most ${v.maxLength} characters`;
      }
      return null;
    }
    case 'number': {
      const num = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
      if (typeof num !== 'number' || Number.isNaN(num)) return `${label} must be a number`;
      if (v.min !== undefined && num < v.min) return `${label} must be at least ${v.min}`;
      if (v.max !== undefined && num > v.max) return `${label} must be at most ${v.max}`;
      return null;
    }
    case 'date': {
      if (typeof value !== 'string') return `${label} must be a date`;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return `${label} must be a valid date`;
      return null;
    }
    case 'select':
    case 'radio': {
      if (typeof value !== 'string') return `${label} must be one of the available options`;
      if (field.options && !field.options.includes(value)) {
        return `${label} must be one of the available options`;
      }
      return null;
    }
    case 'checkbox': {
      // Single checkbox (no options): a boolean. Multi-checkbox (with
      // options): an array whose every entry is one of the options.
      if (field.options && field.options.length > 0) {
        if (!Array.isArray(value)) return `${label} must be a list of options`;
        for (const entry of value) {
          if (typeof entry !== 'string' || !field.options.includes(entry)) {
            return `${label} contains an option that is not available`;
          }
        }
        return null;
      }
      if (typeof value !== 'boolean') return `${label} must be true or false`;
      return null;
    }
    case 'file': {
      // A file field's value must be the stored file reference
      // { name, url, size, mime } produced by the server-side upload —
      // never raw bytes, never a bare string. The reference is checked
      // against this field's variant accept list and size limit, and
      // its storage path must be a form-upload path whose extension
      // matches its MIME type (a forged reference pointing at another
      // file cannot pass the extension/MIME check, and the admin file
      // route additionally verifies the path belongs to this form).
      if (!isFileReference(value)) return `${label} must be an uploaded file`;
      const config = uploadVariantConfig(field.uploadVariant);
      if (!(config.mimes as readonly string[]).includes(value.mime)) {
        return `${label} must be ${config.description}`;
      }
      if (value.size <= 0 || value.size > config.maxBytes) {
        return `${label} must be 5 MB or smaller`;
      }
      if (!isFormUploadPath(value.url)) {
        return `${label} is not a valid uploaded file`;
      }
      const ext = fileExtensionOf(value.url);
      const canonical = MIME_TO_EXTENSION[value.mime];
      if (canonical !== ext && !(value.mime === 'image/jpeg' && ext === 'jpeg')) {
        return `${label} does not match its file type`;
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Validate submitted data against the STORED form schema. `data` must
 * be a plain object keyed by field id. Extra keys (fields the form
 * does not define) are rejected, as are missing required fields and
 * values that fail their field's type/rules.
 */
export function validateSubmissionAgainstSchema(
  schema: FormSchema,
  data: unknown,
): SubmissionValidationResult {
  const fieldErrors: Record<string, string> = {};
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, fieldErrors: { _form: 'Submission data must be an object keyed by field id' } };
  }
  const submitted = data as Record<string, unknown>;
  // Tampered/extra fields: anything not in the schema is rejected.
  for (const key of Object.keys(submitted)) {
    if (!schema.fields.some((f) => f.id === key)) {
      fieldErrors[key] = 'Unknown field';
    }
  }
  for (const field of schema.fields) {
    const value = submitted[field.id];
    // A required single checkbox (no options) that is unchecked (false)
    // is empty — an "I agree" box must be checked to submit.
    const empty =
      isEmptyValue(value) ||
      (field.type === 'checkbox' &&
        (!field.options || field.options.length === 0) &&
        value === false);
    if (empty) {
      if (field.required) {
        fieldErrors[field.id] = `${field.label} is required`;
      }
      continue;
    }
    const error = validateFieldValue(field, value);
    if (error) fieldErrors[field.id] = error;
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true };
}

/** Narrow a validated schema value to the typed FormSchema shape. */
export function toTypedFormSchema(schema: unknown): FormSchema | null {
  const result = validateFormSchema(schema);
  if (!result.ok) return null;
  return schema as FormSchema;
}

export type { FormFieldType };
