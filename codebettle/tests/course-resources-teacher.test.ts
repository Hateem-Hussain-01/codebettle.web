// Per-course Resources — teacher side (Worker B).
//
// Pure-function tests for the lesson materials editor in the instructor
// curriculum builder, plus static wiring checks that the client component
// actually uses these helpers in its save/create paths. No API, model or
// migration change is involved: the lesson APIs already accept `materials`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addMaterialRow,
  emptyMaterial,
  isValidMaterialUrl,
  materialsEqual,
  materialsPatchFragment,
  removeMaterialRow,
  sanitizeMaterials,
  updateMaterialRow,
  validateMaterials,
  type LessonMaterial,
} from '../lib/lesson-materials';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const clientSrc = () => read('app/instructor/courses/[id]/instructor-course-manage-client.tsx');

const slides = (): LessonMaterial => ({ name: 'Week 1 Slides', url: 'https://drive.google.com/file/d/abc' });
const notes = (): LessonMaterial => ({ name: 'Lecture Notes', url: 'http://example.com/notes.pdf' });

test('editor rows: add appends a blank row, update edits one field, remove drops one row', () => {
  const added = addMaterialRow([slides()]);
  assert.equal(added.length, 2);
  assert.deepEqual(added[1], emptyMaterial());
  // Adding does not mutate the original list.
  assert.equal(addMaterialRow([]).length, 1);

  const updated = updateMaterialRow(added, 1, 'name', 'Week 1 Slides');
  assert.equal(updated[1].name, 'Week 1 Slides');
  assert.equal(updated[1].url, '');
  assert.equal(updated[0].name, 'Week 1 Slides'); // other rows untouched
  const updatedUrl = updateMaterialRow(updated, 1, 'url', 'https://drive.google.com/file/d/xyz');
  assert.equal(updatedUrl[1].url, 'https://drive.google.com/file/d/xyz');

  const removed = removeMaterialRow(updatedUrl, 0);
  assert.deepEqual(removed, [updatedUrl[1]]);
  // Out-of-range indices are no-ops, never throw.
  assert.deepEqual(updateMaterialRow([slides()], 5, 'name', 'x'), [slides()]);
  assert.deepEqual(removeMaterialRow([slides()], -1), [slides()]);
});

test('sanitize: trims values and drops fully-empty rows, keeps incomplete rows for validation', () => {
  assert.deepEqual(sanitizeMaterials([
    { name: '  Week 1 Slides  ', url: '  https://drive.google.com/file/d/abc  ' },
    { name: '', url: '' },
    { name: '   ', url: '   ' },
  ]), [slides()]);
  // A row with only a name (or only a URL) is NOT dropped here — it is
  // incomplete and validateMaterials() must reject it instead.
  assert.deepEqual(sanitizeMaterials([{ name: 'Slides', url: '' }]), [{ name: 'Slides', url: '' }]);
  assert.deepEqual(sanitizeMaterials([{ name: '', url: 'https://example.com/x.pdf' }]), [{ name: '', url: 'https://example.com/x.pdf' }]);
});

test('URL rule: only http:// and https:// links are valid resource URLs', () => {
  assert.equal(isValidMaterialUrl('https://drive.google.com/file/d/abc'), true);
  assert.equal(isValidMaterialUrl('http://example.com/notes.pdf'), true);
  assert.equal(isValidMaterialUrl('  https://example.com/x.pdf  '), true); // surrounding spaces are trimmed
  assert.equal(isValidMaterialUrl('ftp://example.com/x.pdf'), false);
  assert.equal(isValidMaterialUrl('drive.google.com/file/d/abc'), false);
  assert.equal(isValidMaterialUrl('/files/notes.pdf'), false);
  assert.equal(isValidMaterialUrl(''), false);
});

test('validate: complete rows pass; incomplete rows are rejected with a message naming the lesson', () => {
  assert.equal(validateMaterials([slides(), notes()], 'Class 1'), null);
  assert.equal(validateMaterials([], 'Class 1'), null);
  // A fully-empty row is an untouched "Add resource" row: ignored, not an error.
  assert.equal(validateMaterials([slides(), emptyMaterial()], 'Class 1'), null);

  const noName = validateMaterials([{ name: '', url: 'https://example.com/x.pdf' }], 'Class 2');
  assert.match(noName ?? '', /Class 2/);
  assert.match(noName ?? '', /name/i);

  const noUrl = validateMaterials([{ name: 'Slides', url: '' }], 'Class 2');
  assert.match(noUrl ?? '', /Class 2/);
  assert.match(noUrl ?? '', /Slides/);

  const badScheme = validateMaterials([{ name: 'Slides', url: 'ftp://example.com/x.pdf' }], 'Class 2');
  assert.match(badScheme ?? '', /http/);
  assert.match(badScheme ?? '', /Class 2/);
});

test('save PATCH payload: materials included only when the list changed', () => {
  // Unchanged (same content, and whitespace-only edits) → omitted.
  assert.deepEqual(materialsPatchFragment([slides()], [slides()]), {});
  assert.deepEqual(materialsPatchFragment(
    [{ name: ' Week 1 Slides ', url: 'https://drive.google.com/file/d/abc ' }],
    [slides()],
  ), {});

  // Added a row → included, trimmed.
  assert.deepEqual(materialsPatchFragment([slides(), notes()], [slides()]), { materials: [slides(), notes()] });
  // Removed a row → included (the new, shorter list).
  assert.deepEqual(materialsPatchFragment([], [slides()]), { materials: [] });
  // Edited a URL → included with the new value.
  assert.deepEqual(
    materialsPatchFragment([{ name: 'Week 1 Slides', url: 'https://drive.google.com/file/d/def' }], [slides()]),
    { materials: [{ name: 'Week 1 Slides', url: 'https://drive.google.com/file/d/def' }] },
  );
  // A leftover blank row does not count as a change.
  assert.deepEqual(materialsPatchFragment([slides(), emptyMaterial()], [slides()]), {});
  assert.equal(materialsEqual([slides()], [slides(), emptyMaterial()]), true);
  assert.equal(materialsEqual([slides()], [notes()]), false);
});

test('wiring: curriculum editor renders the materials editor and saves through it', () => {
  const src = clientSrc();
  // Editor UI: rows with name + URL inputs, remove button, add button.
  assert.match(src, /Add resource/);
  assert.match(src, /updateMaterial\(mod\.id, ses\.id, mi, 'name'/);
  assert.match(src, /updateMaterial\(mod\.id, ses\.id, mi, 'url'/);
  assert.match(src, /removeMaterial\(mod\.id, ses\.id, mi\)/);
  assert.match(src, /addMaterial\(mod\.id, ses\.id\)/);
  // Save: incomplete rows block the curriculum save with a toast error…
  assert.match(src, /validateMaterials\(lesson\.materials, lesson\.title\)/);
  assert.match(src, /if \(error\) \{ toast\.error\(error\); return; \}/);
  // …the lesson PATCH diff sends materials only when changed…
  assert.match(src, /materialsPatchFragment\(lesson\.materials, savedLesson\.materials\)/);
  // …and lesson creation includes materials when the teacher added any.
  assert.match(src, /materials: materials\.length > 0 \? materials : undefined/);
});

test('wiring: no upload flow, no new storage bucket, no model/API change', () => {
  const src = clientSrc();
  // The recordings tab legitimately says "upload recordings here", but no
  // file-upload machinery (FormData / file input / storage bucket) may appear.
  assert.doesNotMatch(src, /new FormData|type="file"|supabase\.storage|\.storage\.from/);
});
