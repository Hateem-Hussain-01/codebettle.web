// Website intro — REMOVED (Eman, 21 Nov 2026 ~23:02 PKT: "Intro
// video delete kr do wo NH lagani").
//
// The intro video is gone entirely: no video file, no player, no
// pre-hydration script, no session flag, no intro-done event, no
// first-paint cover, no hero fade-in gating. The site opens
// directly on the hero — no waiting, no blank screen. Everything
// else stays: the hero (typewriter, 3D scene at 35%, static
// backdrop at 50%), the theme ink-wipe (PR #93), the sidebar
// (PR #94).
//
// These tests pin the removal: the intro files must not exist, the
// root layout and globals.css must not reference the intro, the 3D
// wrapper must render the scene at once with no intro gating, and
// the branch must touch only the removal's own files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

test('the intro is gone: no video file, no player, no helper', () => {
  assert.ok(!existsSync(join(root, 'public/intro-video.mp4')), 'public/intro-video.mp4 must be deleted — no video served');
  assert.ok(!existsSync(join(root, 'components/intro/WebsiteIntro.tsx')), 'components/intro/WebsiteIntro.tsx must be deleted');
  assert.ok(!existsSync(join(root, 'lib/intro.ts')), 'lib/intro.ts must be deleted — no session flag, no intro-done event');
});

test('root layout mounts no intro and runs no intro script', () => {
  const layout = read('app/layout.tsx');
  assert.ok(!layout.includes('WebsiteIntro'), 'layout must not mount the intro component');
  assert.ok(!layout.includes('INTRO_SCRIPT'), 'layout must not render the intro decision script');
  assert.ok(!layout.includes('cb-intro'), 'layout must not reference the intro data attribute');
  assert.ok(!layout.includes('lib/intro'), 'layout must not import the intro helper');
  assert.ok(layout.includes('THEME_SCRIPT'), 'theme pre-hydration script must stay (unrelated to the intro)');
  assert.ok(layout.includes('{children}'), 'layout must still render its children');
});

test('globals.css paints no pre-hydration intro cover', () => {
  const css = read('app/globals.css');
  assert.ok(!css.includes('data-cb-intro'), 'no intro cover rule must remain in globals.css');
  assert.ok(!css.includes('cb-intro'), 'no intro reference must remain in globals.css');
});

test('hero 3D scene renders at once — no intro fade-in gating', () => {
  const wrapper = read('components/sections/HeroSceneWrapper.tsx');
  assert.ok(!wrapper.toLowerCase().includes('intro'), 'wrapper must not mention the intro in any casing');
  assert.ok(!wrapper.includes('onIntroDone'), 'scene must not wait for an intro-done event');
  assert.ok(!wrapper.includes('introAlreadyDone'), 'scene must not gate on an intro-pending check');
  assert.ok(!wrapper.includes('INTRO_DONE_FALLBACK_MS'), 'scene must not carry the intro fallback');
  assert.ok(!wrapper.includes('introFade'), 'scene must not carry the intro fade value');
  assert.ok(wrapper.includes('HERO_SCENE_OPACITY'), 'wrapper must still carry the named dim factor');
  assert.ok(wrapper.includes('0.35'), '3D scene must still render at 35% opacity');
  assert.ok(wrapper.includes('sceneOpacityDimmed'), 'scroll fade must still multiply on top of the dim');
  assert.ok(wrapper.includes('<HeroScene scrollYProgress={scrollYProgress}'), 'scene must still render (dimmed, not removed)');
});

test('hero has no count-up anymore (upper stats removed 20 Nov) — typewriter untouched', () => {
  const hero = read('components/sections/HeroSection.tsx');
  assert.ok(!hero.includes('HeroLoadCounter'), 'hero load counter must be gone');
  assert.ok(!hero.includes('onIntroDone'), 'hero must not subscribe to the intro-done event');
  assert.ok(!hero.includes('INTRO_DONE_FALLBACK_MS'), 'hero must not carry the intro fallback');
  assert.ok(!hero.includes('HERO_STATS'), 'hero must not define a stats row');
  assert.ok(hero.includes('TYPEWRITER_WORDS'), 'hero typewriter must be untouched');
  assert.ok(hero.includes('setTimeout(() => setDisplayed(word.slice(0, displayed.length + 1)), 80)'), 'hero typing speed (80ms) must be unchanged');
  assert.ok(hero.includes('<PublicPageBackdrop variant="hero" particles={false}'), 'static backdrop must still render (dimmed, not removed)');
  assert.ok(hero.includes('opacity-50'), 'static backdrop must render at half strength');
});

// ---------------------------------------------------------------- scope guard

test('intro removal touches only its own files (no dashboard/sidebar overlap)', () => {
  const worktree = join(root, '..');
  let base: string;
  try {
    base = execSync('git merge-base HEAD origin/main', { cwd: worktree, encoding: 'utf8' }).trim();
  } catch {
    // No git history available (CI's shallow checkout has no
    // origin/main, so merge-base throws) — the guard cannot run; the
    // manual diff audit in the PR body is the backstop. Same pattern
    // as the V32 / premium-3D guards. Do not fail the suite.
    return;
  }
  // Base → working tree (covers committed-on-branch AND uncommitted
  // edits) plus untracked files (new files are not in any diff yet).
  const tracked = execSync(`git diff --name-only ${base}`, { cwd: worktree, encoding: 'utf8' });
  const untracked = execSync('git ls-files --others --exclude-standard', { cwd: worktree, encoding: 'utf8' });
  const files = [...tracked.split('\n'), ...untracked.split('\n')]
    .map((f) => f.trim())
    .filter(Boolean);
  const allowed = new Set([
    'codebettle/app/layout.tsx',
    'codebettle/app/globals.css',
    'codebettle/components/sections/HeroSceneWrapper.tsx',
    'codebettle/components/intro/WebsiteIntro.tsx',
    'codebettle/lib/intro.ts',
    'codebettle/tests/website-intro.test.ts',
    // The exact video file itself — deleted by this removal.
    'codebettle/public/intro-video.mp4',
    // The light-mode audit's allowlist entry for the intro splash
    // goes away with the component it allowed.
    'codebettle/tests/theme-light-audit.test.ts',
  ]);
  // Merged state: on main the diff vs merge-base is empty, so there
  // is nothing to guard. Same vacuous-pass pattern as the V32 scope
  // guard. The guard still fires on any branch that actually changes
  // files.
  if (files.length === 0) return;
  // This guard only applies to a branch that touches an intro file.
  // A later branch that changes only dashboard files must not trip
  // it; if a branch touches intro files AND other files, the
  // allowlist check below still fails on the non-intro ones.
  const INTRO_SOURCE = [...allowed].filter((f) => !f.startsWith('codebettle/tests/'));
  if (!files.some((f) => INTRO_SOURCE.includes(f))) return;
  for (const f of files) {
    assert.ok(allowed.has(f), `intro removal must not touch ${f} (outside its scope)`);
  }
});
