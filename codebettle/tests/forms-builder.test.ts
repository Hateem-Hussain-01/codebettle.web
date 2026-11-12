import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FORM_PALETTE,
  findPaletteItem,
  formStatusLabel,
  formTypeLabel,
  paletteItemToField,
  reorderFields,
  uniqueFieldId,
  validateSchema,
  submissionCountOf,
  formatSubmissionValue,
  type FormSchema,
} from '../lib/forms';

test('palette: every required group and item exists with a sensible field type', () => {
  const groups = Object.fromEntries(FORM_PALETTE.map((g) => [g.category, g.items.map((i) => i.key)]));
  assert.deepEqual(groups['Personal Information'], ['first-name', 'last-name', 'date-of-birth', 'gender']);
  assert.deepEqual(groups['Contact Information'], ['email', 'phone', 'address', 'city', 'country']);
  assert.deepEqual(groups['Account Information'], ['username', 'password']);
  assert.deepEqual(groups['Educational Information'], ['institution', 'degree', 'department', 'semester', 'cgpa']);
  assert.deepEqual(groups['Custom'], ['short-text', 'long-text', 'number', 'dropdown', 'radio', 'checkbox']);

  assert.equal(findPaletteItem('date-of-birth')?.type, 'date');
  assert.equal(findPaletteItem('gender')?.type, 'select');
  assert.equal(findPaletteItem('email')?.type, 'email');
  assert.equal(findPaletteItem('phone')?.type, 'tel');
  assert.equal(findPaletteItem('address')?.type, 'textarea');
  assert.equal(findPaletteItem('password')?.type, 'password');
  assert.equal(findPaletteItem('cgpa')?.type, 'number');
  assert.equal(findPaletteItem('dropdown')?.type, 'select');
  assert.equal(findPaletteItem('radio')?.type, 'radio');
  assert.equal(findPaletteItem('checkbox')?.type, 'checkbox');
  assert.equal(findPaletteItem('no-such-field'), undefined);
});

test('palette→field mapping: defaults, options and validation carry over', () => {
  const gender = paletteItemToField(findPaletteItem('gender')!, []);
  assert.equal(gender.id, 'gender');
  assert.equal(gender.label, 'Gender');
  assert.equal(gender.required, false);
  assert.deepEqual(gender.options, ['Male', 'Female', 'Prefer not to say']);
  assert.equal(gender.styling?.width, 'full');

  const cgpa = paletteItemToField(findPaletteItem('cgpa')!, []);
  assert.deepEqual(cgpa.validation, { min: 0, max: 4 });

  const email = paletteItemToField(findPaletteItem('email')!, []);
  assert.equal(email.placeholder, 'you@example.com');
  assert.equal(email.options, undefined);

  // Options are copied, not shared with the palette definition.
  const dropdown = paletteItemToField(findPaletteItem('dropdown')!, []);
  dropdown.options!.push('Option 3');
  assert.deepEqual(findPaletteItem('dropdown')?.options, ['Option 1', 'Option 2']);
});

test('uniqueFieldId: first use keeps the base id, repeats get a numeric suffix', () => {
  assert.equal(uniqueFieldId('email', []), 'email');
  assert.equal(uniqueFieldId('email', ['email']), 'email-2');
  assert.equal(uniqueFieldId('email', ['email', 'email-2']), 'email-3');
});

test('reorderFields: moves within the list, clamps, and never mutates', () => {
  const fields = ['a', 'b', 'c', 'd'];
  assert.deepEqual(reorderFields(fields, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(reorderFields(fields, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(reorderFields(fields, 1, 1), ['a', 'b', 'c', 'd']);
  assert.deepEqual(reorderFields(fields, 0, 99), ['b', 'c', 'd', 'a']);
  assert.deepEqual(reorderFields(fields, 2, -5), ['c', 'a', 'b', 'd']);
  assert.deepEqual(reorderFields(fields, 9, 0), ['a', 'b', 'c', 'd']);
  assert.deepEqual(fields, ['a', 'b', 'c', 'd']);
});

test('validateSchema: a well-formed schema passes', () => {
  const schema: FormSchema = {
    fields: [
      { id: 'first-name', type: 'text', label: 'First Name', required: true },
      { id: 'gender', type: 'select', label: 'Gender', required: false, options: ['Male', 'Female'] },
      { id: 'cgpa', type: 'number', label: 'CGPA', required: false, validation: { min: 0, max: 4 } },
      { id: 'bio', type: 'textarea', label: 'Bio', required: false, validation: { minLength: 0, maxLength: 500, pattern: '^[A-Za-z ]+$' } },
    ],
  };
  assert.deepEqual(validateSchema(schema), []);
  assert.deepEqual(validateSchema({ fields: [] }), ['A form must have at least one field.']);
});

test('validateSchema: duplicate ids are reported', () => {
  const schema: FormSchema = {
    fields: [
      { id: 'email', type: 'email', label: 'Email', required: true },
      { id: 'email', type: 'email', label: 'Email again', required: false },
    ],
  };
  const errors = validateSchema(schema);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Duplicate field id "email"/);
});

test('validateSchema: option fields with no options are blocked', () => {
  const schema: FormSchema = {
    fields: [
      { id: 'pick', type: 'select', label: 'Pick one', required: false, options: [] },
      { id: 'choose', type: 'radio', label: 'Choose', required: false, options: [' ', ''] },
      { id: 'ok', type: 'checkbox', label: 'Tick', required: false, options: ['Yes'] },
    ],
  };
  const errors = validateSchema(schema);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /Pick one.*at least one option/);
  assert.match(errors[1], /Choose.*at least one option/);
});

test('validateSchema: blank labels, bad ranges and bad patterns are reported', () => {
  const schema: FormSchema = {
    fields: [
      { id: 'a', type: 'text', label: '  ', required: false },
      { id: 'b', type: 'text', label: 'Name', required: false, validation: { minLength: 10, maxLength: 5 } },
      { id: 'c', type: 'number', label: 'Age', required: false, validation: { min: 100, max: 1 } },
      { id: 'd', type: 'text', label: 'Code', required: false, validation: { pattern: '([invalid' } },
      { id: 'e', type: 'text', label: 'Note', required: false, validation: { minLength: -1 } },
    ],
  };
  const errors = validateSchema(schema);
  assert.equal(errors.length, 5);
  assert.match(errors.join(' | '), /needs a label/);
  assert.match(errors.join(' | '), /min length \(10\) is greater than max length \(5\)/);
  assert.match(errors.join(' | '), /min value \(100\) is greater than max value \(1\)/);
  assert.match(errors.join(' | '), /not a valid regular expression/);
  assert.match(errors.join(' | '), /min length cannot be negative/);
});

test('submissionCountOf: accepts either count shape, defaults to 0', () => {
  const base = { id: '1', name: 'F', slug: 'f', type: 'survey' as const, status: 'draft' as const, createdAt: '2026-11-12' };
  assert.equal(submissionCountOf(base), 0);
  assert.equal(submissionCountOf({ ...base, submissionCount: 7 }), 7);
  assert.equal(submissionCountOf({ ...base, _count: { submissions: 3 } }), 3);
});

test('wire values are lowercase; labels are the display form', () => {
  assert.equal(formTypeLabel('registration'), 'Registration');
  assert.equal(formTypeLabel('survey'), 'Survey');
  assert.equal(formStatusLabel('draft'), 'Draft');
  assert.equal(formStatusLabel('published'), 'Published');
});

test('formatSubmissionValue: arrays, booleans and empties render plainly', () => {
  assert.equal(formatSubmissionValue('hello'), 'hello');
  assert.equal(formatSubmissionValue(['a', 'b']), 'a, b');
  assert.equal(formatSubmissionValue([]), '—');
  assert.equal(formatSubmissionValue(true), 'Yes');
  assert.equal(formatSubmissionValue(false), 'No');
  assert.equal(formatSubmissionValue(null), '—');
  assert.equal(formatSubmissionValue(undefined), '—');
  assert.equal(formatSubmissionValue(''), '—');
  assert.equal(formatSubmissionValue(3.5), '3.5');
});
