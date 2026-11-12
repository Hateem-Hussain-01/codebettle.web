/**
 * Forms Builder shared types + pure helpers (Phase 6, Worker B — admin UI).
 *
 * The admin UI builds against the /api/admin/forms contract owned by
 * Worker A (see the task brief). These helpers are pure and unit-tested
 * (tests/forms-builder.test.ts) so the palette mapping, reordering and
 * schema validation work the same in the builder UI and in tests.
 *
 * Form-level settings (submit button text, success message) are stored
 * inside `schema` next to `fields`: the contract's PATCH accepts a
 * `schema` object, and the schema is a JSON blob. Verified against
 * Worker A's live code: `validateFormSchema` only inspects `fields`
 * (extra keys pass through), the update service stores the schema
 * verbatim, and Worker C's public-form module reads
 * `schema.submitButtonText` / `schema.successMessage` from the stored
 * schema — so the settings round-trip to the public form.
 *
 * Wire values are LOWERCASE for status ('draft' | 'published');
 * `type` is the form's free-text purpose (any non-empty string up
 * to 50 chars — 'registration', 'survey', 'Feedback', ...).
 * Display labels come from formTypeLabel / formStatusLabel below.
 */
import type { FormStyle } from './form-style';
import { validateCoverImageUrlValue, validateFormStyleValue } from './form-style';

import type { UploadVariant } from './form-uploads';
import { isFileReference } from './form-uploads';

export type FormFieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'password'
  | 'file';

export interface FormFieldValidation {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
}

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  validation?: FormFieldValidation;
  styling?: { width?: 'full' | 'half' };
  /** File fields only: upload variant (default 'files'). */
  uploadVariant?: UploadVariant;
}

export type { FormStyle, FormButtonShape, FormFont, FormWidth } from './form-style';

export interface FormSchema {
  fields: FormField[];
  /** Text on the public form's submit button. */
  submitButtonText?: string;
  /** Message shown to the submitter after a successful submission. */
  successMessage?: string;
  /** Whole-form custom styling (GHL-like). Absent = site defaults. */
  style?: FormStyle;
  /** Cover image banner URL (uploaded to the public `course-images` bucket, or a URL). */
  coverImageUrl?: string;
}

/**
 * A form's purpose — free text, any non-empty string up to 50 chars.
 * The alias is kept so existing imports don't churn.
 */
export type FormType = string;
export type FormStatus = 'draft' | 'published';

/**
 * Display label for a form purpose: the raw string with its first
 * letter title-cased ('registration' -> 'Registration',
 * 'job application' -> 'Job application').
 */
export function formTypeLabel(type: FormType): string {
  if (!type) return '';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function formStatusLabel(status: FormStatus): string {
  return status === 'published' ? 'Published' : 'Draft';
}

export interface AdminFormListItem {
  id: string;
  name: string;
  slug: string;
  type: FormType;
  description?: string | null;
  status: FormStatus;
  createdAt: string;
  /** Either shape the API returns (contract allows both). */
  _count?: { submissions?: number };
  submissionCount?: number;
}

export interface AdminFormDetail extends AdminFormListItem {
  schema: FormSchema;
}

export interface AdminSubmission {
  id: string;
  /** Answers keyed by field id. */
  data: Record<string, unknown>;
  reviewed: boolean;
  submittedAt: string;
  submitterId?: string | null;
}

/** Submissions count regardless of which count shape the API returns. */
export function submissionCountOf(form: AdminFormListItem): number {
  return form._count?.submissions ?? form.submissionCount ?? 0;
}

/** Human-readable rendering of one submitted value in the detail view. */
export function formatSubmissionValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  // A stored file reference renders as its filename (not a JSON blob).
  if (isFileReference(value)) return value.name;
  if (Array.isArray(value)) return value.length > 0 ? value.map(String).join(', ') : '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export interface PaletteItem {
  /** Stable key, also the base for the generated field id. */
  key: string;
  label: string;
  type: FormFieldType;
  placeholder?: string;
  /** Default options for select/radio/checkbox items. */
  options?: string[];
  validation?: FormFieldValidation;
  /** File items only: the upload variant the new field accepts. */
  uploadVariant?: UploadVariant;
}

export interface PaletteGroup {
  category: string;
  items: PaletteItem[];
}

/**
 * Palette groups, in the order the builder shows them. Every item maps
 * to a field type with a sensible default label — the mapping lives in
 * `paletteItemToField` and is covered by tests.
 */
export const FORM_PALETTE: PaletteGroup[] = [
  {
    category: 'Personal Information',
    items: [
      { key: 'first-name', label: 'First Name', type: 'text', placeholder: 'e.g. Muhammad' },
      { key: 'last-name', label: 'Last Name', type: 'text', placeholder: 'e.g. Hussain' },
      { key: 'date-of-birth', label: 'Date of Birth', type: 'date' },
      {
        key: 'gender',
        label: 'Gender',
        type: 'select',
        options: ['Male', 'Female', 'Prefer not to say'],
      },
    ],
  },
  {
    category: 'Contact Information',
    items: [
      { key: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com' },
      { key: 'phone', label: 'Phone', type: 'tel', placeholder: '+92 3XX XXXXXXX' },
      { key: 'address', label: 'Address', type: 'textarea', placeholder: 'Street, area' },
      { key: 'city', label: 'City', type: 'text', placeholder: 'e.g. Faisalabad' },
      { key: 'country', label: 'Country', type: 'text', placeholder: 'e.g. Pakistan' },
    ],
  },
  {
    category: 'Account Information',
    items: [
      { key: 'username', label: 'Username', type: 'text', placeholder: 'Choose a username' },
      { key: 'password', label: 'Password', type: 'password', placeholder: 'Min. 8 characters' },
    ],
  },
  {
    category: 'Educational Information',
    items: [
      { key: 'institution', label: 'Institution', type: 'text', placeholder: 'e.g. University of Agriculture, Faisalabad' },
      { key: 'degree', label: 'Degree', type: 'text', placeholder: 'e.g. BS Software Engineering' },
      { key: 'department', label: 'Department', type: 'text', placeholder: 'e.g. Computer Science' },
      { key: 'semester', label: 'Semester', type: 'number', validation: { min: 1, max: 12 } },
      { key: 'cgpa', label: 'CGPA', type: 'number', validation: { min: 0, max: 4 } },
    ],
  },
  {
    category: 'Upload',
    items: [
      { key: 'picture-upload', label: 'Image upload', type: 'file', uploadVariant: 'picture', placeholder: 'Upload an image (JPG, PNG, WebP, GIF — max 5 MB)' },
      { key: 'document-upload', label: 'Document upload', type: 'file', uploadVariant: 'document', placeholder: 'Upload a document (PDF, DOC, DOCX — max 5 MB)' },
      { key: 'video-upload', label: 'Video upload', type: 'file', uploadVariant: 'video', placeholder: 'Upload a video (MP4, WebM, MOV — max 5 MB)' },
      { key: 'file-upload', label: 'Files upload', type: 'file', uploadVariant: 'files', placeholder: 'Upload a file (images, PDF, Office docs, text — max 5 MB)' },
    ],
  },
  {
    category: 'Custom',
    items: [
      { key: 'short-text', label: 'Short Text', type: 'text', placeholder: 'Your answer' },
      { key: 'long-text', label: 'Long Text', type: 'textarea', placeholder: 'Your answer' },
      { key: 'number', label: 'Number', type: 'number' },
      { key: 'dropdown', label: 'Dropdown', type: 'select', options: ['Option 1', 'Option 2'] },
      { key: 'radio', label: 'Radio', type: 'radio', options: ['Option 1', 'Option 2'] },
      { key: 'checkbox', label: 'Checkbox', type: 'checkbox', options: ['Option 1', 'Option 2'] },
    ],
  },
];

/** Flat lookup of every palette item by key. */
export function findPaletteItem(key: string): PaletteItem | undefined {
  for (const group of FORM_PALETTE) {
    const item = group.items.find((i) => i.key === key);
    if (item) return item;
  }
  return undefined;
}

/** Unique field id derived from the palette key (`first-name`, `first-name-2`, …). */
export function uniqueFieldId(base: string, existingIds: string[]): string {
  const taken = new Set(existingIds);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Turn a palette item into a new field (fresh id, defaults applied). */
export function paletteItemToField(item: PaletteItem, existingIds: string[]): FormField {
  const field: FormField = {
    id: uniqueFieldId(item.key, existingIds),
    type: item.type,
    label: item.label,
    required: false,
    styling: { width: 'full' },
  };
  if (item.placeholder) field.placeholder = item.placeholder;
  if (item.options) field.options = [...item.options];
  if (item.validation) field.validation = { ...item.validation };
  if (item.type === 'file') field.uploadVariant = item.uploadVariant ?? 'files';
  return field;
}

/** Field types that CAN carry an options list (options editor shown). */
export const OPTION_FIELD_TYPES: FormFieldType[] = ['select', 'radio', 'checkbox'];

/** Field types where minLength/maxLength/pattern apply. */
export const TEXT_FIELD_TYPES: FormFieldType[] = ['text', 'email', 'tel', 'textarea', 'password'];

// ---------------------------------------------------------------------------
// Reorder + validation (pure — unit-tested)
// ---------------------------------------------------------------------------

/**
 * Move the field at `fromIndex` to `toIndex`. Out-of-range indices are
 * clamped; a no-op move returns a copy of the original array.
 */
export function reorderFields<T>(fields: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...fields];
  if (fromIndex < 0 || fromIndex >= next.length) return next;
  const clampedTo = Math.max(0, Math.min(toIndex, next.length - 1));
  const [moved] = next.splice(fromIndex, 1);
  next.splice(clampedTo, 0, moved);
  return next;
}

/**
 * Validate a form schema before saving. Returns a list of human-readable
 * problems (empty = valid). The builder blocks saving while any are
 * present. Checks: duplicate/blank ids, blank labels, select/radio with
 * no usable options, checkbox options blank when present, minLength >
 * maxLength, min > max, negative lengths, and uncompilable regex
 * patterns. `opts.requireFields` (default true) requires at least one
 * field — pass `{ requireFields: false }` for draft saves (a form may
 * be saved mid-build with no fields yet); publishing requires fields.
 */
export function validateSchema(schema: FormSchema, opts?: { requireFields?: boolean }): string[] {
  const errors: string[] = [];
  const fields = schema?.fields ?? [];
  // Matches the server rule (lib/services/form-schema.ts): publishing
  // requires at least one field; saving a draft mid-build may have none.
  if (fields.length === 0 && opts?.requireFields !== false) {
    errors.push('A form must have at least one field.');
  }
  // GHL upgrade: whole-form style + cover image travel inside the
  // schema too — same rules as the server validator (hex colours only,
  // whitelisted enums, safe cover URL), so the builder blocks bad
  // values before they ever reach the API.
  errors.push(...validateFormStyleValue(schema?.style));
  errors.push(...validateCoverImageUrlValue(schema?.coverImageUrl));
  const seenIds = new Set<string>();

  fields.forEach((field, index) => {
    const where = `Field ${index + 1}${field.label ? ` ("${field.label}")` : ''}`;
    if (!field.id || !field.id.trim()) {
      errors.push(`${where} has no id.`);
    } else if (seenIds.has(field.id)) {
      errors.push(`Duplicate field id "${field.id}" — each field needs a unique id.`);
    } else {
      seenIds.add(field.id);
    }
    if (!field.label || !field.label.trim()) {
      errors.push(`${where} needs a label.`);
    }
    // A file field's variant must be one of the four upload variants
    // (an absent variant means 'files' — the server default).
    if (field.type === 'file' && field.uploadVariant !== undefined) {
      const valid = ['picture', 'document', 'video', 'files'].includes(field.uploadVariant);
      if (!valid) {
        errors.push(`"${field.label || field.type}" has an unknown upload variant "${field.uploadVariant}".`);
      }
    }
    // Only select/radio REQUIRE options. A checkbox without options is
    // a single boolean ("I agree"); with options it is a multi-select.
    // When options are present on any type they must be non-empty.
    if (field.type === 'select' || field.type === 'radio') {
      const usable = (field.options ?? []).filter((o) => o.trim().length > 0);
      if (usable.length === 0) {
        errors.push(`"${field.label || field.type}" needs at least one option.`);
      }
    } else if (field.options !== undefined) {
      const usable = field.options.filter((o) => o.trim().length > 0);
      if (usable.length !== field.options.length) {
        errors.push(`"${field.label || field.type}" has a blank option — remove it or fill it in.`);
      }
    }
    const v = field.validation ?? {};
    if (v.minLength !== undefined && v.minLength < 0) {
      errors.push(`"${field.label}" — min length cannot be negative.`);
    }
    if (v.maxLength !== undefined && v.maxLength < 0) {
      errors.push(`"${field.label}" — max length cannot be negative.`);
    }
    if (
      v.minLength !== undefined &&
      v.maxLength !== undefined &&
      v.minLength > v.maxLength
    ) {
      errors.push(`"${field.label}" — min length (${v.minLength}) is greater than max length (${v.maxLength}).`);
    }
    if (v.min !== undefined && v.max !== undefined && v.min > v.max) {
      errors.push(`"${field.label}" — min value (${v.min}) is greater than max value (${v.max}).`);
    }
    if (v.pattern) {
      try {
        new RegExp(v.pattern);
      } catch {
        errors.push(`"${field.label}" — pattern "${v.pattern}" is not a valid regular expression.`);
      }
    }
  });

  return errors;
}
