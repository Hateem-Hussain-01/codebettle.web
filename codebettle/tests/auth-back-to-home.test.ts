// Back to Home link on the auth pages (Eman, 28 Nov 2026).
//
// The gold "CodeBettle" logo at the top of the sign-in / sign-up forms
// already links home, but nothing says so — there is no back button
// and no navbar on the auth pages. Each form header now carries an
// explicit "Back to Home" link (short "Home" on phones) at the left
// of the logo row, absolutely positioned so the pages keep fitting
// one screen without scrolling (the PR #100 fit work). These tests
// pin that: the link, its destination, its label, and the zero-height
// placement — on BOTH forms, since login and register are separate
// components sharing the AuthShell.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

for (const file of ['components/auth/LoginForm.tsx', 'components/auth/RegisterForm.tsx']) {
  test(`back to home: ${file} links home from its header`, () => {
    const src = read(file);
    assert.ok(src.includes('ArrowLeft'), 'back link must use the ArrowLeft icon');
    assert.ok(src.includes('aria-label="Back to home"'), 'back link must be labelled for screen readers');
    assert.ok(src.includes('Back to Home'), 'back link must read "Back to Home" (desktop)');
    assert.ok(src.includes('absolute left-0 top-1'), 'back link must sit in the logo row, absolutely positioned');
    assert.ok(src.includes('relative mb-4 text-center'), 'the header must be the positioning context');
    // Zero height cost: the link rides the existing logo row, it must
    // not add a line of its own — the auth pages fit one screen.
    assert.ok(!src.includes('Back to Home</h1>'), 'the back link must not become a heading');
    // The logo link home stays too — the back link is an addition,
    // not a replacement for it.
    assert.ok(src.includes('gradient-text'), 'the CodeBettle logo link home must stay');
  });
}
