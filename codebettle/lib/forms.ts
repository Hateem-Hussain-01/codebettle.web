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
 * Wire values are LOWERCASE (verified against Worker A's zod schemas
 * and lib/db/types.ts): type 'registration' | 'survey', status
 * 'draft' | 'published'. Display labels come from formTypeLabel /
 * formStatusLabel below.
 */

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
  | 'password';

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
}

export interface FormSchema {
  fields: FormField[];
  /** Text on the public form's submit button. */
  submitButtonText?: string;
  /** Message shown to the submitter after a successful submission. */
  successMessage?: string;
}

export type FormType = 'registration' | 'survey';
export type FormStatus = 'draft' | 'published';

/** Display labels for the lowercase wire values Worker A's API uses. */
export function formTypeLabel(type: FormType): string {
  return type === 'registration' ? 'Registration' : 'Survey';
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
  return field;
}

/** Field types that need a non-empty options list. */
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
 * present. Checks: at least one field, duplicate/blank ids, blank labels,
 * option fields with no usable options, minLength > maxLength, min > max,
 * negative lengths, and uncompilable regex patterns.
 */
export function validateSchema(schema: FormSchema): string[] {
  const errors: string[] = [];
  const fields = schema?.fields ?? [];
  // Matches the server rule (Worker A, lib/services/form-schema.ts):
  // a form must have at least one field before it can be saved.
  if (fields.length === 0) {
    errors.push('A form must have at least one field.');
  }
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
    if (OPTION_FIELD_TYPES.includes(field.type)) {
      const usable = (field.options ?? []).filter((o) => o.trim().length > 0);
      if (usable.length === 0) {
        errors.push(`"${field.label || field.type}" needs at least one option.`);
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
