// Hero code-window typewriter (Eman, 28 Nov 2026).
//
// As soon as the site loads, the student.py code in the home hero
// writes itself out start to end, then stops — no loop, no restart.
// These tests pin that: the same 12 lines with the same text and
// syntax colours as the old static window, one character per tick at
// CODE_TYPE_MS after a short start delay, a caret that rides the
// typing position and disappears when the code is complete, reduced
// motion showing the full code at once, and the headline typewriter
// untouched (its 80ms line is pinned by the intro guard too).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const hero = () => read('components/sections/HeroSection.tsx');

test('code window keeps the exact student.py code, as data', () => {
  const src = hero();
  assert.ok(src.includes('CODE_LINES'), 'code must live in a CODE_LINES table');
  assert.equal((src.match(/^  \[/gm) || []).length, 12, 'CODE_LINES must hold exactly 12 lines');
  // Same text and colours as the old static window, token by token.
  for (const token of [
    "'class '",
    "'Developer'",
    "'__init__'",
    "'self.name'",
    "'self.skills'",
    "'self.skills.append'",
    "'learn'",
    "'return '",
    "'\"Level up\"'",
    "'you.learn'",
    "'\"Python\"'",
    "'# start today'",
  ]) {
    assert.ok(src.includes(token), `CODE_LINES must contain ${token}`);
  }
  assert.ok(src.includes('text-primary-text'), 'keywords must stay gold');
  assert.ok(src.includes('text-primary-light'), 'string literals must stay light gold');
  assert.ok(src.includes('student.py'), 'code window filename must stay student.py');
});

test('typing runs once on load: start delay, one char per tick, then stops', () => {
  const src = hero();
  assert.ok(src.includes('CODE_TYPE_MS = 5'), 'typing speed must be 5ms per character');
  assert.ok(src.includes('CODE_TYPE_START_DELAY_MS = 500'), 'typing must start 500ms after load');
  assert.ok(src.includes('CODE_TOTAL'), 'typing must run to the full code length');
  assert.ok(src.includes('setCodeTyped((n) => Math.min(n + 1, CODE_TOTAL))'), 'each tick must reveal exactly one more character');
  assert.ok(src.includes('if (codeTyped >= CODE_TOTAL) return;'), 'typing must stop at the end — no loop, no restart');
  assert.ok(!src.includes('setInterval'), 'typing must tick with timeouts, not an interval');
  assert.ok(!src.includes('setCodeTyped(0)'), 'typed count must never reset to 0');
});

test('caret rides the typing position and disappears when done', () => {
  const src = hero();
  assert.ok(src.includes('isActive'), 'render must track the line being typed');
  assert.ok(src.includes('codeTyped < CODE_TOTAL'), 'caret must only show while typing');
  assert.ok(src.includes('bg-primary animate-pulse'), 'caret must be the gold blinking block');
});

test('unrevealed characters keep the window at its final height', () => {
  const src = hero();
  assert.ok(src.includes('opacity-0'), 'unrevealed characters must render invisible, not absent');
  assert.ok(!src.includes('display: none'), 'typing must not hide rows with display:none');
});

test('reduced motion shows the full code at once', () => {
  const src = hero();
  assert.ok(src.includes('useReducedMotion'), 'hero must respect reduced motion');
  assert.ok(src.includes('if (reduceMotion) {'), 'reduced motion must short-circuit the typing');
  assert.ok(src.includes('setCodeTyped(CODE_TOTAL)'), 'reduced motion must reveal the whole code immediately');
});

test('headline typewriter is untouched by the code typewriter', () => {
  const src = hero();
  assert.ok(src.includes('TYPEWRITER_WORDS'), 'headline typewriter word list must stay');
  assert.ok(src.includes('setTimeout(() => setDisplayed(word.slice(0, displayed.length + 1)), 80)'), 'headline typing speed (80ms) must be unchanged');
  assert.ok(src.includes('displayed.slice(0, -1)), 50'), 'headline deleting speed (50ms) must be unchanged');
  assert.ok(src.includes('setTyping(false), 1800'), 'headline full-word hold (1800ms) must be unchanged');
});
