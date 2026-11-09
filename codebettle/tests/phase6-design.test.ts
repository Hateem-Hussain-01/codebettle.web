// Phase 6 — selective neon accents + subtle 3D styling.
//
// These are static design tests: they verify the wiring of the Phase 6
// design system (tokens, neon effect, elevation, reduced-motion rules,
// and the restraint rule that neon is used on exactly five high-value
// actions). They do not render pixels — see RUNBOOK.md Phase 6 for the
// screenshot verification done against the real rendered pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const css = () => read('app/globals.css');

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------- neon CSS

test('neon effect: registered angle property + travelling-arc keyframes exist', () => {
  const c = css();
  assert.match(c, /@property\s+--neon-angle\s*\{[^}]*syntax:\s*'<angle>'/);
  assert.match(c, /@keyframes\s+neon-border-spin\s*\{[^}]*--neon-angle:\s*360deg/);
  assert.match(c, /\.neon-btn::before\s*\{[^}]*conic-gradient\(/);
  assert.match(c, /\.neon-btn::before\s*\{[^}]*animation:\s*neon-border-spin/);
  // The ring is a masked border band, not a filled overlay.
  assert.match(c, /\.neon-btn::before\s*\{[^}]*mask-composite:\s*exclude/);
});

test('neon button: disabled state kills the motion, focus stays visible', () => {
  const c = css();
  assert.match(c, /\.neon-btn:disabled::before\s*\{[^}]*animation:\s*none/);
  assert.match(c, /\.neon-btn:focus-visible\s*\{[^}]*outline:/);
});

test('neon button: static gold glow is present even without animation', () => {
  const c = css();
  assert.match(c, /\.neon-btn\s*\{[^}]*box-shadow:[^}]*rgba\(245,\s*197,\s*24/);
});

// ---------------------------------------------------------------- 3D tokens

test('3D styling: elevation tokens and lift utility exist', () => {
  const c = css();
  assert.match(c, /--shadow-elev-1:/);
  assert.match(c, /--shadow-elev-2:/);
  assert.match(c, /--shadow-elev-3:/);
  assert.match(c, /\.elev-3\s*\{[^}]*box-shadow:\s*var\(--shadow-elev-3\)/);
  assert.match(c, /\.card-lift\s*\{[^}]*transition:[^}]*transform/);
  assert.match(c, /\.card-lift:hover\s*\{[^}]*transform:\s*translateY\(-2px\)/);
  assert.match(c, /\.card-lift:hover\s*\{[^}]*box-shadow:\s*var\(--shadow-elev-2\)/);
  // Press state returns the card to rest — no stuck lift.
  assert.match(c, /\.card-lift:active\s*\{[^}]*transform:\s*translateY\(0\)/);
});

// ---------------------------------------------------------------- reduced motion

test('reduced motion: media query disables animation and motion, keeps the static arc', () => {
  const c = css();
  const at = c.indexOf('@media (prefers-reduced-motion: reduce)');
  assert.ok(at >= 0, 'reduced-motion media query must exist');
  const block = c.slice(at);
  assert.match(block, /animation-duration:\s*0\.01ms/);
  assert.match(block, /animation-iteration-count:\s*1/);
  assert.match(block, /transition-duration:\s*0\.01ms/);
  assert.match(block, /scroll-behavior:\s*auto/);
  assert.match(block, /\.neon-btn::before\s*\{[^}]*animation:\s*none/);
});

test('reduced motion: framer-motion defers to the user preference', () => {
  const layout = read('app/layout.tsx');
  assert.match(layout, /MotionConfig\s+reducedMotion="user"/);
  assert.match(layout, /<MotionConfig[^>]*>[\s\S]*\{children\}/);
});

// ---------------------------------------------------------------- Button wiring

test('Button exposes an opt-in neon prop that adds the neon-btn class', () => {
  const b = read('components/ui/Button.tsx');
  assert.match(b, /neon\?:\s*boolean/);
  assert.match(b, /neon\s*&&\s*'neon-btn'/);
});

// The restraint rule: neon is allowed on exactly these five high-value
// actions. If a sixth appears, this test fails on purpose — adding neon
// is a deliberate design decision, not a drive-by.
const NEON_BUTTONS: Array<[string, string]> = [
  ['components/sections/HeroSection.tsx', 'Explore Courses'],
  ['app/courses/[slug]/course-detail-client.tsx', 'Enroll Now'],
  ['app/student/quizzes/[id]/student-quiz-start-client.tsx', 'Start quiz'],
  ['app/instructor/quizzes/[id]/quiz-detail-client.tsx', 'Publish quiz'],
  ['app/student/quizzes/[id]/attempts/[attemptId]/attempt-client.tsx', 'Submit quiz'],
];

test('neon restraint: exactly five neon buttons, on the named high-value actions', () => {
  const files = [...tsxFiles(join(root, 'app')), ...tsxFiles(join(root, 'components'))];
  const hits: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const tags = src.match(/<Button[\s\S]*?>/g) ?? [];
    for (const tag of tags) {
      if (/\bneon\b/.test(tag)) hits.push(file);
    }
  }
  assert.equal(hits.length, 5, `expected exactly 5 neon buttons, found ${hits.length}: ${hits.join(', ')}`);
  for (const [rel, label] of NEON_BUTTONS) {
    const src = read(rel);
    assert.ok(src.includes(label), `${rel} must still contain its "${label}" action`);
    const tags = src.match(/<Button[\s\S]*?>/g) ?? [];
    assert.ok(tags.some((t) => /\bneon\b/.test(t)), `${rel} must have a neon Button`);
  }
});

test('neon is never set on a non-primary button', () => {
  const files = [...tsxFiles(join(root, 'app')), ...tsxFiles(join(root, 'components'))];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const tags = src.match(/<Button[\s\S]*?>/g) ?? [];
    for (const tag of tags) {
      if (/\bneon\b/.test(tag)) {
        assert.ok(!/variant="(secondary|outline|ghost|danger)"/.test(tag),
          `neon button in ${file} must stay primary: ${tag.slice(0, 80)}`);
      }
    }
  }
});

// ---------------------------------------------------------------- 3D wiring

test('3D wiring: hoverable cards lift, course cards lift, modals use the deep token', () => {
  const card = read('components/ui/Card.tsx');
  assert.match(card, /hover\s*&&\s*'card-lift/);
  const courseCard = read('components/ui/CourseCard.tsx');
  assert.match(courseCard, /className="card-lift /);
  const modal = read('components/ui/Modal.tsx');
  assert.match(modal, /elev-3/);
  assert.doesNotMatch(modal, /shadow-2xl/);
});

test('existing design identity is preserved: dark + gold tokens untouched', () => {
  const c = css();
  assert.match(c, /--color-primary:\s*#F5C518/);
  assert.match(c, /--color-background:\s*#0A0A0A/);
  assert.match(c, /\.glass-card\s*\{/);
  assert.match(c, /\.gradient-text\s*\{/);
});
