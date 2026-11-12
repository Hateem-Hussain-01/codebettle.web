import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DEFAULT_SUBMIT_BUTTON_TEXT,
  DEFAULT_SUCCESS_MESSAGE,
  emptyFormData,
  getSubmitButtonText,
  getSuccessMessage,
  interpretSubmitResponse,
  prepareSubmitData,
  validateFieldValue,
  validateFormData,
  type PublicForm,
  type PublicFormField,
} from '../lib/public-form';
import {
  PublicFormFieldInput,
  PublicFormFields,
} from '../app/forms/[slug]/form-fields';

/**
 * Phase 6 (Worker C) — public form rendering.
 * Pure validation + submit-response logic is unit-tested directly; the
 * schema-driven field renderer is tested with renderToStaticMarkup
 * (one check per field type). Server-side enforcement lives in the POST
 * endpoint (Worker A); client validation here is UX only.
 */

const textField = (over: Partial<PublicFormField> = {}): PublicFormField => ({
  id: 'name',
  type: 'text',
  label: 'Full name',
  placeholder: 'Your name',
  required: true,
  ...over,
});

const noop = () => {};

// ---------------------------------------------------------------- validation

test('validation: required text rejects empty / whitespace, accepts a value', () => {
  assert.equal(validateFieldValue(textField(), ''), 'This field is required.');
  assert.equal(validateFieldValue(textField(), '   '), 'This field is required.');
  assert.equal(validateFieldValue(textField(), undefined), 'This field is required.');
  assert.equal(validateFieldValue(textField(), 'Ayesha'), null);
});

test('validation: optional empty field passes every other rule', () => {
  const optional = textField({ required: false, validation: { minLength: 5, pattern: '^a+$' } });
  assert.equal(validateFieldValue(optional, ''), null);
  assert.equal(validateFieldValue(optional, undefined), null);
});

test('validation: email format', () => {
  const email = textField({ id: 'email', type: 'email', label: 'Email' });
  assert.equal(validateFieldValue(email, 'not-an-email'), 'Enter a valid email address.');
  assert.equal(validateFieldValue(email, 'a@b'), 'Enter a valid email address.');
  assert.equal(validateFieldValue(email, 'a@b.com'), null);
});

test('validation: min/max length', () => {
  const f = textField({ validation: { minLength: 3, maxLength: 5 } });
  assert.equal(validateFieldValue(f, 'ab'), 'Enter at least 3 characters.');
  assert.equal(validateFieldValue(f, 'abcdef'), 'Enter no more than 5 characters.');
  assert.equal(validateFieldValue(f, 'abcd'), null);
});

test('validation: pattern', () => {
  const f = textField({ validation: { pattern: '^[A-Z]{3}[0-9]{2}$' } });
  assert.equal(validateFieldValue(f, 'abc12'), 'Enter a value in the required format.');
  assert.equal(validateFieldValue(f, 'ABC12'), null);
});

test('validation: pattern that does not compile never blocks the visitor', () => {
  const f = textField({ validation: { pattern: '([invalid' } });
  assert.equal(validateFieldValue(f, 'anything'), null);
});

test('validation: number min/max and non-numeric input', () => {
  const f = textField({ id: 'age', type: 'number', label: 'Age', validation: { min: 18, max: 65 } });
  assert.equal(validateFieldValue(f, 'abc'), 'Enter a valid number.');
  assert.equal(validateFieldValue(f, '17'), 'Enter a number of at least 18.');
  assert.equal(validateFieldValue(f, '66'), 'Enter a number of no more than 65.');
  assert.equal(validateFieldValue(f, '30'), null);
});

test('validation: select and radio values must be one of the options', () => {
  const select = textField({
    id: 'track', type: 'select', label: 'Track',
    options: ['Web', 'AI'],
  });
  assert.equal(validateFieldValue(select, 'Mobile'), 'Choose one of the listed options.');
  assert.equal(validateFieldValue(select, 'AI'), null);

  const radio = textField({
    id: 'level', type: 'radio', label: 'Level',
    options: [{ value: 'beg', label: 'Beginner' }, { value: 'adv', label: 'Advanced' }],
  });
  assert.equal(validateFieldValue(radio, 'mid'), 'Choose one of the listed options.');
  assert.equal(validateFieldValue(radio, 'adv'), null);
});

test('validation: required checkbox must be checked', () => {
  const f = textField({ id: 'agree', type: 'checkbox', label: 'I agree' });
  assert.equal(validateFieldValue(f, false), 'This field is required.');
  assert.equal(validateFieldValue(f, undefined), 'This field is required.');
  assert.equal(validateFieldValue(f, true), null);
});

test('validation: multi-checkbox (with options) needs at least one valid choice when required', () => {
  const f = textField({
    id: 'topics', type: 'checkbox', label: 'Topics',
    options: ['Web', 'AI', 'Data'],
  });
  assert.equal(validateFieldValue(f, []), 'This field is required.');
  assert.equal(validateFieldValue(f, ['Mobile']), 'Choose one of the listed options.');
  assert.equal(validateFieldValue(f, ['Web', 'AI']), null);
  // Optional multi-checkbox: empty is fine, a bad choice is not.
  const optional = textField({
    id: 'topics', type: 'checkbox', label: 'Topics', required: false,
    options: ['Web', 'AI'],
  });
  assert.equal(validateFieldValue(optional, []), null);
  assert.equal(validateFieldValue(optional, ['AI']), null);
});

test('validation: validateFormData aggregates per-field errors', () => {
  const fields = [
    textField(),
    textField({ id: 'email', type: 'email', label: 'Email' }),
    textField({ id: 'nick', label: 'Nickname', required: false }),
  ];
  assert.deepEqual(
    validateFormData(fields, { name: '', email: 'bad', nick: '' }),
    { name: 'This field is required.', email: 'Enter a valid email address.' }
  );
  assert.deepEqual(validateFormData(fields, { name: 'Ali', email: 'ali@x.com', nick: '' }), {});
});

test('emptyFormData: blank strings, false for checkboxes', () => {
  assert.deepEqual(
    emptyFormData([
      textField(),
      textField({ id: 'agree', type: 'checkbox', label: 'Agree' }),
    ]),
    { name: '', agree: false }
  );
});

test('emptyFormData: multi-checkbox starts as an empty array', () => {
  assert.deepEqual(
    emptyFormData([
      textField({ id: 'topics', type: 'checkbox', label: 'Topics', options: ['Web', 'AI'] }),
    ]),
    { topics: [] }
  );
});

test('prepareSubmitData: number fields coerce to numbers, blanks stay blank', () => {
  const fields = [
    textField({ id: 'age', type: 'number', label: 'Age' }),
    textField({ id: 'score', type: 'number', label: 'Score', required: false }),
    textField(),
  ];
  assert.deepEqual(
    prepareSubmitData(fields, { age: '30', score: '', name: 'Ali' }),
    { age: 30, score: '', name: 'Ali' }
  );
  assert.deepEqual(
    prepareSubmitData(fields, { age: 'abc', score: '', name: 'Ali' }),
    { age: 'abc', score: '', name: 'Ali' }
  );
});

// ------------------------------------------------------- submit response states

test('submit: 2xx is success and keeps the submission id', () => {
  assert.deepEqual(
    interpretSubmitResponse(200, { ok: true, submissionId: 'sub-1' }),
    { outcome: 'success', submissionId: 'sub-1' }
  );
  assert.deepEqual(
    interpretSubmitResponse(201, { ok: true }),
    { outcome: 'success', submissionId: undefined }
  );
});

test('submit: 400 surfaces the server per-field errors (fieldErrors key)', () => {
  assert.deepEqual(
    interpretSubmitResponse(400, { error: 'Invalid submission', fieldErrors: { email: 'Email must be a valid email address' } }),
    { outcome: 'field-errors', errors: { email: 'Email must be a valid email address' } }
  );
  assert.deepEqual(
    interpretSubmitResponse(400, {}),
    { outcome: 'field-errors', errors: {} }
  );
});

test('submit: 400 also accepts the brief-contract `errors` key as a fallback', () => {
  assert.deepEqual(
    interpretSubmitResponse(400, { errors: { email: 'Enter a valid email address.' } }),
    { outcome: 'field-errors', errors: { email: 'Enter a valid email address.' } }
  );
});

test('submit: 429 is rate-limited', () => {
  assert.deepEqual(interpretSubmitResponse(429, {}), { outcome: 'rate-limited' });
});

test('submit: other failures are a generic error', () => {
  assert.deepEqual(interpretSubmitResponse(500, { error: 'boom' }), { outcome: 'error' });
  assert.deepEqual(interpretSubmitResponse(404, {}), { outcome: 'error' });
});

// ------------------------------------------------------------- success message

test('success message: custom form setting wins, else the default', () => {
  // Settings live inside the schema (builder writes them there).
  const fromSchema = { schema: { successMessage: '  Thanks — see you soon!  ' } } as unknown as PublicForm;
  assert.equal(getSuccessMessage(fromSchema), 'Thanks — see you soon!');
  const fromSettings = { schema: { fields: [] }, settings: { successMessage: 'Got it!' } } as unknown as PublicForm;
  assert.equal(getSuccessMessage(fromSettings), 'Got it!');
  assert.equal(getSuccessMessage({ schema: { fields: [] } } as unknown as PublicForm), DEFAULT_SUCCESS_MESSAGE);
  assert.equal(getSuccessMessage({} as PublicForm), DEFAULT_SUCCESS_MESSAGE);
});

test('submit button text: custom schema text wins, else "Submit"', () => {
  const custom = { schema: { submitButtonText: 'Register now' } } as unknown as PublicForm;
  assert.equal(getSubmitButtonText(custom), 'Register now');
  assert.equal(getSubmitButtonText({ schema: { fields: [] } } as unknown as PublicForm), DEFAULT_SUBMIT_BUTTON_TEXT);
  assert.equal(getSubmitButtonText({} as PublicForm), DEFAULT_SUBMIT_BUTTON_TEXT);
});

// ------------------------------------------------------------------- rendering

function renderField(field: PublicFormField, value: unknown = '', error?: string): string {
  return renderToStaticMarkup(
    PublicFormFieldInput({ field, value, error, onChange: noop })
  );
}

test('rendering: text/email/tel/password render the matching input type + label + placeholder', () => {
  const text = renderField(textField());
  assert.match(text, /<label[^>]*>Full name \*<\/label>/);
  assert.match(text, /<input[^>]*type="text"/);
  assert.match(text, /placeholder="Your name"/);

  assert.match(renderField(textField({ id: 'email', type: 'email', label: 'Email' })), /type="email"/);
  assert.match(renderField(textField({ id: 'phone', type: 'tel', label: 'Phone' })), /type="tel"/);
  assert.match(renderField(textField({ id: 'pw', type: 'password', label: 'Password' })), /type="password"/);
});

test('rendering: optional field has no required marker', () => {
  const html = renderField(textField({ required: false }));
  assert.doesNotMatch(html, /Full name \*/);
  assert.match(html, /Full name/);
});

test('rendering: textarea renders a textarea element', () => {
  const html = renderField(textField({ id: 'bio', type: 'textarea', label: 'Bio' }));
  assert.match(html, /<textarea[^>]*>/);
  assert.match(html, /Bio \*/);
});

test('rendering: number renders min/max attributes', () => {
  const html = renderField(
    textField({ id: 'age', type: 'number', label: 'Age', validation: { min: 18, max: 65 } }),
    '30'
  );
  assert.match(html, /type="number"/);
  assert.match(html, /min="18"/);
  assert.match(html, /max="65"/);
});

test('rendering: date renders a date input', () => {
  assert.match(
    renderField(textField({ id: 'dob', type: 'date', label: 'Date of birth' }), '2000-01-01'),
    /type="date"/
  );
});

test('rendering: select renders a dropdown with the options', () => {
  const html = renderField(
    textField({ id: 'track', type: 'select', label: 'Track', options: ['Web', 'AI'] }),
    'AI'
  );
  assert.match(html, /<select[^>]*>/);
  assert.match(html, /<option[^>]*value="Web"[^>]*>Web<\/option>/);
  assert.match(html, /<option[^>]*value="AI"[^>]*>AI<\/option>/);
});

test('rendering: radio renders one radio input per option', () => {
  const html = renderField(
    textField({
      id: 'level', type: 'radio', label: 'Level',
      options: [{ value: 'beg', label: 'Beginner' }, { value: 'adv', label: 'Advanced' }],
    }),
    'beg'
  );
  assert.match(html, /<fieldset[^>]*>/);
  assert.match(html, /type="radio"[^>]*value="beg"/);
  assert.match(html, /Beginner/);
  assert.match(html, /Advanced/);
});

test('rendering: checkbox renders a checkbox with its label', () => {
  const html = renderField(
    textField({ id: 'agree', type: 'checkbox', label: 'I agree to the terms' }),
    true
  );
  assert.match(html, /type="checkbox"/);
  assert.match(html, /I agree to the terms/);
});

test('rendering: multi-checkbox renders one checkbox per option, checked ones marked', () => {
  const html = renderField(
    textField({ id: 'topics', type: 'checkbox', label: 'Topics', options: ['Web', 'AI'] }),
    ['AI']
  );
  assert.match(html, /<fieldset[^>]*>/);
  assert.match(html, /Topics \*/);
  assert.match(html, /type="checkbox"[^>]*value="Web"/);
  assert.match(html, /type="checkbox"[^>]*value="AI"/);
  assert.match(html, /checked/);
});

test('rendering: per-field error message shows under the control', () => {
  const html = renderField(textField(), '', 'This field is required.');
  assert.match(html, /This field is required\./);
});

test('rendering: consecutive half-width fields share a two-column row', () => {
  const fields = [
    textField({ id: 'first', label: 'First name', styling: { width: 'half' } }),
    textField({ id: 'last', label: 'Last name', styling: { width: 'half' } }),
    textField({ id: 'email', type: 'email', label: 'Email' }),
  ];
  const html = renderToStaticMarkup(
    PublicFormFields({ fields, values: {}, errors: {}, onChange: noop })
  );
  assert.match(html, /grid sm:grid-cols-2 gap-4/);
  assert.match(html, /First name/);
  assert.match(html, /Last name/);
  assert.match(html, /Email/);
});

test('rendering: a lone half-width field takes a full row', () => {
  const fields = [
    textField({ id: 'first', label: 'First name', styling: { width: 'half' } }),
    textField({ id: 'email', type: 'email', label: 'Email' }),
  ];
  const html = renderToStaticMarkup(
    PublicFormFields({ fields, values: {}, errors: {}, onChange: noop })
  );
  assert.doesNotMatch(html, /grid sm:grid-cols-2/);
});
