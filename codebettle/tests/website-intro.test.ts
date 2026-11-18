// Website intro & loading experience (Eman, 18 Nov 2026 — "Done bna do").
//
// A ~4s branded splash on the landing page ONLY, once per browser
// session on the first full load of "/". CodeBettle's own motion
// (dark + gold) — the "notiune" video was reference only.
//
// These tests pin the contract: session-scoping, skip, reduced
// motion, the hero count-up gating (stats must start at the reveal,
// never behind the intro), the first-paint cover, and the scope
// (landing page + root layout + hero integration only — no
// PortalLayout/layout/sidebar/dashboard files, so no conflict with
// the merged V32 (#77) and sidebar (#78) PRs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
  INTRO_DATA_ATTR,
  INTRO_DONE_EVENT,
  INTRO_PARTICLES,
  INTRO_REVEAL_AT_MS,
  INTRO_SCRIPT,
  INTRO_SEEN_KEY,
  INTRO_TAGLINE,
  INTRO_TOTAL_MS,
  INTRO_TYPE_AT_MS,
  INTRO_TYPE_DURATION_MS,
  INTRO_TYPE_MS_PER_CHAR,
  shouldShowIntro,
} from '../lib/intro';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

// ---------------------------------------------------------------- pure decision

test('intro shows only on the first full load of "/" in a fresh session', () => {
  const firstVisit = { seen: false, reducedMotion: false, pathname: '/', isEntry: true };
  assert.equal(shouldShowIntro(firstVisit), true, 'first visit to / must show the intro');
  assert.equal(shouldShowIntro({ ...firstVisit, seen: true }), false, 'seen this session — never again');
  assert.equal(shouldShowIntro({ ...firstVisit, reducedMotion: true }), false, 'reduced motion — never animate');
  assert.equal(shouldShowIntro({ ...firstVisit, pathname: '/courses' }), false, 'not the landing page — no intro');
  assert.equal(shouldShowIntro({ ...firstVisit, pathname: '/auth/login' }), false, 'auth pages — no intro');
  assert.equal(shouldShowIntro({ ...firstVisit, isEntry: false }), false, 'SPA navigation to / — never replayed');
});

test('intro fits the ~4s cap: typing finishes before the reveal', () => {
  assert.ok(INTRO_TOTAL_MS <= 4000, `total must be <= 4000ms, got ${INTRO_TOTAL_MS}`);
  assert.equal(
    INTRO_TYPE_DURATION_MS,
    INTRO_TAGLINE.length * INTRO_TYPE_MS_PER_CHAR,
    'typing duration must be the tagline length times the per-char speed',
  );
  assert.ok(
    INTRO_TYPE_AT_MS + INTRO_TYPE_DURATION_MS < INTRO_REVEAL_AT_MS,
    `typing (${INTRO_TYPE_AT_MS + INTRO_TYPE_DURATION_MS}ms) must finish before the reveal (${INTRO_REVEAL_AT_MS}ms)`,
  );
  // The hero typewriter's 80ms/char suits 5–16-char role words; a
  // 118-char sentence at that speed would take ~9.5s and blow the
  // cap. The intro speed adapts to the length (style, not speed,
  // is what is shared with the hero).
  assert.ok(INTRO_TYPE_MS_PER_CHAR < 80, 'intro typing must be faster than the hero role typewriter');
});

test('particles are deterministic and stay on screen', () => {
  assert.equal(INTRO_PARTICLES.length, 14, 'fourteen gold particles');
  for (const p of INTRO_PARTICLES) {
    assert.ok(p.left >= 0 && p.left <= 100, `particle left ${p.left} must be a percentage`);
    assert.ok(p.top >= 0 && p.top <= 100, `particle top ${p.top} must be a percentage`);
    assert.ok(p.size >= 2 && p.size <= 4, `particle size ${p.size} must be 2–4px`);
  }
});

test('pre-hydration script mirrors the pure decision', () => {
  assert.ok(INTRO_SCRIPT.includes(`sessionStorage.getItem('${INTRO_SEEN_KEY}')`), 'script must check the session flag');
  assert.ok(INTRO_SCRIPT.includes("matchMedia('(prefers-reduced-motion: reduce)')"), 'script must check reduced motion');
  assert.ok(INTRO_SCRIPT.includes("location.pathname!=='/'"), 'script must run only on the landing page');
  assert.ok(INTRO_SCRIPT.includes(`data-${INTRO_DATA_ATTR}`), 'script must set the data attribute');
  assert.ok(INTRO_SCRIPT.includes('__cbIntroMounted'), 'script must have the 5s fallback if React never mounts');
});

// ---------------------------------------------------------------- component source

const intro = () => read('components/intro/WebsiteIntro.tsx');

test('intro overlay: real bee mark, letters, tagline, skip, circular reveal', () => {
  const src = intro();
  assert.ok(src.includes("images from '@/lib/certificates/assets/images.json'"), 'bee must come from the embedded brand asset (no network fetch)');
  assert.ok(src.includes('data:image/png;base64'), 'bee must render as a bundled data URI');
  assert.ok(src.includes("'CODEBETTLE'.split('')"), 'wordmark must rise letter by letter');
  assert.ok(src.includes('INTRO_TAGLINE'), 'tagline must be the shared constant (hero subtext verbatim)');
  assert.ok(src.includes('Skip intro'), 'explicit Skip affordance must exist');
  assert.ok(src.includes("e.key === 'Escape'"), 'Esc must skip');
  assert.ok(src.includes('onClick={skip}'), 'tap/click anywhere must skip');
  assert.ok(src.includes("clipPath: 'circle(0% at 50% 50%)'"), 'reveal must collapse the overlay clip-path circle to the centre');
  assert.ok(src.includes("clipPath: 'circle(150% at 50% 50%)'"), 'overlay must start fully covering');
  assert.ok(src.includes('border-primary'), 'the expanding ring must be gold');
  assert.ok(src.includes('role="dialog"'), 'overlay must be labelled as a dialog');
});

test('intro plays only when the pre-hydration script flagged this load', () => {
  const src = intro();
  assert.ok(src.includes('getAttribute(`data-${INTRO_DATA_ATTR}`)'), 'component must read the script flag');
  assert.ok(src.includes("pathname === '/'"), 'component must only play on the landing page');
  assert.ok(src.includes('useReducedMotion'), 'component must respect reduced motion');
  assert.ok(src.includes('sessionStorage') || src.includes('markIntroSeen'), 'component must mark the session when done');
  assert.ok(src.includes('dispatchIntroDone'), 'component must tell the hero when it is over');
  assert.ok(src.includes("document.body.style.overflow = 'hidden'"), 'background scroll must lock while the intro plays');
});

test('root layout mounts the intro and the pre-hydration script with the CSP nonce', () => {
  const layout = read('app/layout.tsx');
  assert.ok(layout.includes('INTRO_SCRIPT'), 'layout must render the intro decision script');
  assert.ok(layout.includes('<WebsiteIntro />'), 'layout must mount the intro component');
  assert.ok(layout.includes('dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }}'), 'intro script must use the nonce path like the theme script');
});

test('globals.css paints the pre-hydration cover only when the flag is set', () => {
  const css = read('app/globals.css');
  assert.ok(css.includes('html[data-cb-intro="show"] body::before'), 'cover rule must be scoped to the flag');
  assert.ok(css.includes('z-index: 9999'), 'cover must sit above everything until the overlay mounts');
});

test('hero count-up waits for the intro, and the hero is otherwise untouched', () => {
  const hero = read('components/sections/HeroSection.tsx');
  assert.ok(hero.includes('HeroLoadCounter'), 'hero stats must still count up (component kept)');
  assert.ok(hero.includes('onIntroDone'), 'count-up must wait for the intro-done event');
  assert.ok(hero.includes('INTRO_DONE_FALLBACK_MS'), 'count-up must have a fallback so it can never stick at 0');
  assert.ok(hero.includes("{ value: 1500, suffix: '+', label: 'Students trained'"), 'hero stats values must be unchanged');
  assert.ok(hero.includes("{ value: 4.8, suffix: '/5', label: 'Average rating'"), 'hero rating must be unchanged');
  assert.ok(hero.includes('TYPEWRITER_WORDS'), 'hero typewriter must be untouched');
  assert.ok(hero.includes('setTimeout(() => setDisplayed(word.slice(0, displayed.length + 1)), 80)'), 'hero typing speed (80ms) must be unchanged');
});

test('3D scene fades in at the reveal without changing no-intro loads', () => {
  const wrapper = read('components/sections/HeroSceneWrapper.tsx');
  assert.ok(wrapper.includes('useMotionValue'), 'fade must use a MotionValue (SSR-safe: server and first client render identical)');
  assert.ok(wrapper.includes('introAlreadyDone()'), 'fade must only engage when an intro is pending');
  assert.ok(wrapper.includes('onIntroDone'), 'fade must start on the intro-done event');
  assert.ok(!wrapper.includes('useState(() => introAlreadyDone())'), 'no React-state opacity — that would mismatch hydration');
});

test('intro dispatches the exact event the hero listens for', () => {
  assert.equal(INTRO_DONE_EVENT, 'cb:intro-done', 'event name must be stable');
  const hero = read('components/sections/HeroSection.tsx');
  assert.ok(hero.includes('onIntroDone'), 'hero must subscribe to the intro-done event');
});

// ---------------------------------------------------------------- scope guard

test('intro touches only landing-page, layout, hero and intro files (no dashboard/sidebar overlap)', () => {
  const worktree = join(root, '..');
  const base = execSync('git merge-base HEAD origin/main', { cwd: worktree, encoding: 'utf8' }).trim();
  // Base → working tree (covers committed-on-branch AND uncommitted
  // edits) plus untracked files (new files are not in any diff yet).
  // This keeps the guard honest before the first commit as well as
  // in CI after the push.
  const tracked = execSync(`git diff --name-only ${base}`, { cwd: worktree, encoding: 'utf8' });
  const untracked = execSync('git ls-files --others --exclude-standard', { cwd: worktree, encoding: 'utf8' });
  const files = [...tracked.split('\n'), ...untracked.split('\n')]
    .map((f) => f.trim())
    .filter(Boolean);
  const allowed = new Set([
    'codebettle/app/layout.tsx',
    'codebettle/app/globals.css',
    'codebettle/components/sections/HeroSection.tsx',
    'codebettle/components/sections/HeroSceneWrapper.tsx',
    'codebettle/components/intro/WebsiteIntro.tsx',
    'codebettle/lib/intro.ts',
    'codebettle/tests/website-intro.test.ts',
    // Guard fixes this PR had to make to land on post-V32 main (not
    // feature scope): the V32 scope guard fired on any later branch,
    // and the light-mode audit needed an allowlist entry for the
    // intentionally fixed-dark intro splash.
    'codebettle/tests/dashboard-v32.test.ts',
    'codebettle/tests/theme-light-audit.test.ts',
  ]);
  for (const f of files) {
    assert.ok(allowed.has(f), `intro PR must not touch ${f} (outside its landing-page scope)`);
  }
  assert.ok(files.length > 0, 'diff must not be empty');
});
