// Hero screenshot redesign (Eman, 17 Nov 2026 — from his screenshot
// of the calm-vs-3D preview).
//
// The landing-page hero matches the screenshot: two columns (left:
// badge, two-line typewriter headline, subtext, two CTAs; right: the
// student.py code window). The three hero stats along the bottom were
// REMOVED (Eman, 20 Nov 2026 — the same numbers appeared twice); the
// stats live only in the StatsSection below the hero. The 3D scene
// behind the content, the Mac-window frame, the StatsSection below
// the hero and the navbar are untouched — see the premium-3D guard
// for those.
//
// A correction the same day OVERRIDES the original brief's "static
// headline / delete the typewriter": the typewriter KEEPS working
// exactly as before, cycling the role phrases on headline line 2.
// These tests pin that: TYPEWRITER_WORDS unchanged, the typing effect
// wired up, line 1 static "Become a", line 2 the rotating role, and
// the headline never wrapping to a third line. Do NOT write a test
// asserting a static headline — Eman corrected that.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const hero = () => read('components/sections/HeroSection.tsx');

// ---------------------------------------------------------------- badge + headline

test('hero badge is the admissions pill', () => {
  const src = hero();
  assert.ok(src.includes('ADMISSIONS OPEN — NEW BATCHES'), 'badge must read "ADMISSIONS OPEN — NEW BATCHES"');
  assert.ok(!src.includes("Pakistan's #1 Digital Institute"), 'old badge must be gone');
});

test('hero badge background is opaque so 3D shapes cannot show through it', () => {
  const src = hero();
  // 17 Nov 2026 — badge legibility: the pill was bg-primary/10 and the
  // gold 3D icosahedron drifting behind the hero showed through it on
  // the live page, hiding the pill's left border and partly obscuring
  // the "A" in "ADMISSIONS". The pill must be solid bg-background
  // (opaque in both themes, matching the hero section behind it).
  const pill = src.slice(src.lastIndexOf('<span', src.indexOf('ADMISSIONS OPEN')), src.indexOf('ADMISSIONS OPEN'));
  assert.ok(pill.includes('bg-background'), 'badge pill must have a solid bg-background');
  assert.ok(!pill.includes('bg-primary/10'), 'badge pill must NOT be translucent bg-primary/10');
  assert.ok(pill.includes('border-primary/30'), 'badge pill keeps its gold border');
  assert.ok(pill.includes('text-primary-text'), 'badge pill keeps its gold text');
});

test('hero headline is two lines: static "Become a", typewriter role — never a third', () => {
  const src = hero();
  // Line 1: static.
  assert.ok(
    src.includes('<span className="block text-foreground">Become a</span>'),
    'headline line 1 must be the static "Become a"',
  );
  // Line 2: the typewriter role, gold, with the em-relative cursor.
  assert.ok(src.includes('{displayed}'), 'headline line 2 must render the typewriter word');
  assert.ok(src.includes('gradient-text'), 'the role must be gold (gradient-text)');
  assert.ok(src.includes('h-[0.75em]'), 'typewriter cursor must stay em-relative');
  // Exactly two lines in the h1 — never a third.
  const h1 = src.slice(src.indexOf('<motion.h1'), src.indexOf('</motion.h1>'));
  assert.equal((h1.match(/className="block/g) || []).length, 2, 'headline must have exactly two block lines');
  // The PR #62 mechanism, re-sized for the left column: nowrap +
  // fluid clamp (preview sizing 1.9rem -> 3.1rem) so the longest role
  // ("Mobile Developer") fits its line at every viewport.
  assert.ok(src.includes('whitespace-nowrap'), 'headline lines must be whitespace-nowrap');
  assert.ok(src.includes('text-[clamp(1.9rem,4.6vw,3.1rem)]'), 'headline must use the preview clamp size');
  assert.ok(!src.includes('text-[clamp(1.25rem,5.2vw,4.5rem)]'), 'old full-width clamp must be gone — it was sized for the centred layout');
});

test('typewriter is intact: same words, same timing', () => {
  const src = hero();
  assert.ok(src.includes('TYPEWRITER_WORDS'), 'typewriter word list must stay');
  for (const word of ['Web Developer', 'Mobile Developer', 'Data Scientist', 'UI/UX Designer', 'DevOps Engineer']) {
    assert.ok(src.includes(`'${word}'`), `typewriter list must still include '${word}'`);
  }
  // Same typing effect: 80ms per char typing, 50ms deleting, 1800ms
  // hold at the full word, then cycle.
  assert.ok(src.includes('word.slice(0, displayed.length + 1)), 80'), 'typing speed must stay 80ms');
  assert.ok(src.includes('displayed.slice(0, -1)), 50'), 'deleting speed must stay 50ms');
  assert.ok(src.includes('setTyping(false), 1800'), 'full-word hold must stay 1800ms');
  assert.ok(src.includes('setWordIndex((i) => (i + 1) % TYPEWRITER_WORDS.length)'), 'words must still cycle');
});

// ---------------------------------------------------------------- subtext + CTAs

test('hero subtext is the exact screenshot copy', () => {
  const src = hero();
  assert.ok(
    src.includes('Learn by building real projects, with mentors who review your work — from your first line of code to your first job.'),
    'subtext must match the screenshot exactly',
  );
  assert.ok(!src.includes('Expert-led courses in web development'), 'old subtext must be gone');
});

test('hero CTAs: Explore Courses (gold, /courses) + Book a Call (outline, /book-a-call)', () => {
  const src = hero();
  assert.ok(src.includes('Explore Courses'), 'Explore Courses button must stay');
  assert.ok(src.includes('href="/courses"'), 'Explore Courses must link to /courses');
  assert.ok(src.includes('Book a Call'), 'Book a Call button must exist');
  assert.ok(src.includes('href="/book-a-call"'), 'Book a Call must link to /book-a-call');
  assert.ok(src.includes("variant=\"outline\""), 'Book a Call must be the outline button');
  assert.ok(!src.includes('How It Works'), 'old second CTA must be gone');
  assert.ok(!src.includes('href="/about"'), 'hero must not link the second CTA to /about');
});

// ---------------------------------------------------------------- student.py code window

test('hero code window is student.py with the exact Developer code', () => {
  const src = hero();
  assert.ok(src.includes('student.py'), 'code window filename must be student.py');
  assert.ok(!src.includes('hello.py'), 'old hello.py filename must be gone');
  assert.ok(!src.includes('become_developer'), 'old become_developer snippet must be gone');
  // The exact code from the preview, token by token (JSX splits the
  // lines across spans, so tokens — not whole lines — are asserted).
  for (const token of [
    'Developer',
    '__init__',
    'self.name',
    'self.skills',
    'learn',
    'Level up',
    'Future You',
    'you.learn',
    '# start today',
  ]) {
    assert.ok(src.includes(token), `code window must contain '${token}'`);
  }
  // Twelve numbered lines, like the preview.
  assert.ok(src.includes('>12</span>'), 'code window must have 12 numbered lines');
  // Gold dots stay (dark + gold); the red/yellow/green dots belong
  // to the course cards only.
  assert.ok(src.includes('bg-primary'), 'code window keeps its gold dots');
  assert.ok(!src.includes('#ff5f57'), 'hero window must not use the macOS red dot');
});

// ---------------------------------------------------------------- layout: two columns

test('hero is two columns on desktop, stacked on mobile', () => {
  const src = hero();
  assert.ok(src.includes('lg:grid-cols-[1.05fr_0.95fr]'), 'hero must be 1.05fr / 0.95fr two columns on desktop (preview layout)');
  assert.ok(src.includes('grid lg:grid-cols-'), 'columns must stack below lg');
  assert.ok(!src.includes('text-center py-32'), 'old centred hero container must be gone');
  // Narrow-phone blowout (found by a real browser at 390px): the
  // code window's longest line is wider than the single-column grid
  // track, so without min-w-0 the grid blows out to ~360px and the
  // text runs to the viewport edge. Both grid children must be
  // shrinkable, and the code body must scroll long lines inside the
  // window instead of clipping them.
  assert.ok(src.includes('text-left min-w-0'), 'left column must be shrinkable (min-w-0)');
  assert.ok(src.includes('relative min-w-0'), 'code-window column must be shrinkable (min-w-0)');
  assert.ok(src.includes('overflow-x-auto whitespace-nowrap'), 'code body must scroll long lines inside the window');
});

// ---------------------------------------------------------------- hero stats: REMOVED (20 Nov 2026)

// (Eman, 20 Nov 2026 — "upper walay stats ko remove kr do"): the
// three hero stats (1500+ Students trained / 300+ Reviews / 4.8/5
// Average rating) are REMOVED from the bottom of the hero — the same
// numbers appeared twice (hero row + StatsSection below) and it did
// not look good. The StatsSection below keeps its four stats and its
// scroll-gated Counter, untouched (see the test below).
test('hero has NO stats row: the upper stats were removed 20 Nov', () => {
  const src = hero();
  assert.ok(!src.includes('HERO_STATS'), 'hero must not define a stats row');
  assert.ok(!src.includes('value: 1500'), '1500+ must not be in the hero');
  assert.ok(!src.includes('value: 300'), '300+ must not be in the hero');
  assert.ok(!src.includes('value: 4.8'), '4.8 must not be in the hero');
  assert.ok(!src.includes('Students trained'), 'Students trained label must not be in the hero');
  assert.ok(!src.includes("'Reviews'"), 'Reviews label must not be in the hero');
  assert.ok(!src.includes('Average rating'), 'Average rating label must not be in the hero');
  assert.ok(!src.includes('function HeroLoadCounter'), 'hero load counter must be gone');
  assert.ok(!src.includes('HeroLoadCounter to={stat.value}'), 'hero stats must not use the load counter');
  assert.ok(!src.includes('border-t border-dark-border'), 'hero stats row top border must be gone');
});

test('StatsSection below keeps its four stats', () => {
  const stats = read('components/sections/StatsSection.tsx');
  assert.ok(stats.includes('value: 1500'), 'StatsSection 1500+ must stay');
  assert.ok(stats.includes('value: 8'), 'StatsSection 8+ must stay');
  assert.ok(stats.includes('value: 300'), 'StatsSection 300+ must stay');
  assert.ok(stats.includes('value: 4.8'), 'StatsSection 4.8 must stay');
  assert.ok(stats.includes('function Counter'), 'StatsSection Counter must stay');
  const page = read('app/page.tsx');
  assert.ok(page.indexOf('<StatsSection') > page.indexOf('<HeroSection'), 'StatsSection must still follow the hero');
});
