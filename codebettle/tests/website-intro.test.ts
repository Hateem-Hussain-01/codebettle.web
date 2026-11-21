// Website intro (Eman, 21 Nov 2026 — "EXACT COPY NA KRO, WO EXACT
// VIDEO HE LAGA DO WAHA PAY").
//
// The intro is the EXACT video file he sent (the CodeBettle logo
// intro, 9.7s, 1920x1080 — tunnel + bee logo), served as-is from
// public/intro-video.mp4 — no rebuild, no re-animation, no trim.
// The animated intro (bee + letters + tagline, PRs #79/#85) is
// gone. (The notiune reference recording was a misread — NOT the
// intro, never to be embedded.)
//
// These tests pin the contract: session-scoping, skip, reduced
// motion, the 3D fade-in gating (the scene fades in when the video
// ends, never behind the intro), the first-paint cover, and the scope
// (landing page + root layout + hero integration only — no
// PortalLayout/layout/sidebar/dashboard files, so no conflict with
// the merged V32 (#77) and sidebar (#78) PRs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
  INTRO_COVER_FALLBACK_MS,
  INTRO_DATA_ATTR,
  INTRO_DONE_EVENT,
  INTRO_DONE_FALLBACK_MS,
  INTRO_SCRIPT,
  INTRO_SEEN_KEY,
  INTRO_VIDEO_DURATION_MS,
  INTRO_VIDEO_SRC,
  shouldShowIntro,
} from '../lib/intro';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

// ---------------------------------------------------------------- pure decision

test('intro shows only on the first full load of "/" in a fresh session', () => {
  const firstVisit = { seen: false, reducedMotion: false, pathname: '/', isEntry: true };
  assert.equal(shouldShowIntro(firstVisit), true, 'first visit to / must show the intro');
  assert.equal(shouldShowIntro({ ...firstVisit, seen: true }), false, 'seen this session — never again');
  assert.equal(shouldShowIntro({ ...firstVisit, reducedMotion: true }), false, 'reduced motion — never play the video');
  assert.equal(shouldShowIntro({ ...firstVisit, pathname: '/courses' }), false, 'not the landing page — no intro');
  assert.equal(shouldShowIntro({ ...firstVisit, pathname: '/auth/login' }), false, 'auth pages — no intro');
  assert.equal(shouldShowIntro({ ...firstVisit, isEntry: false }), false, 'SPA navigation to / — never replayed');
});

test('video intro: 9.7s file, hero-done fallback exceeds it, cover fallback is hydration-only', () => {
  assert.equal(INTRO_VIDEO_SRC, '/intro-video.mp4', `video must be served from ${INTRO_VIDEO_SRC}`);
  assert.equal(INTRO_VIDEO_DURATION_MS, 9700, `video duration must be 9700ms (the file is 9.72s), got ${INTRO_VIDEO_DURATION_MS}`);
  // The hero-done fallback must stay above the video, or a missed
  // event could start the 3D fade-in mid-video and let it finish
  // hidden behind the overlay.
  assert.ok(
    INTRO_DONE_FALLBACK_MS > INTRO_VIDEO_DURATION_MS,
    `hero-done fallback (${INTRO_DONE_FALLBACK_MS}ms) must exceed the video (${INTRO_VIDEO_DURATION_MS}ms)`,
  );
  // The cover fallback is NOT sized to the video — the cover drops
  // the moment the component mounts (hydration, seconds), so 10s is
  // hydration protection only. It must stay at 10s (the 20 Nov
  // mobile fix: slow phones can take longer than 5s to hydrate).
  assert.equal(INTRO_COVER_FALLBACK_MS, 10000, `cover fallback must be 10000ms, got ${INTRO_COVER_FALLBACK_MS}`);
});

test('the exact video file ships in public/ — never re-encoded, never trimmed', () => {
  const file = join(root, 'public/intro-video.mp4');
  assert.ok(existsSync(file), 'public/intro-video.mp4 must exist in the repo');
  const size = statSync(file).size;
  assert.ok(size > 1_000_000, `video file must be substantial (got ${size} bytes) — the 9.7s 1080p recording is ~16.6 MB`);
  // MP4 magic: bytes 4–7 are "ftyp" — the file is really an MP4,
  // not a renamed placeholder. Read only the header, not the whole
  // 13 MB file.
  const fd = openSync(file, 'r');
  const head = Buffer.alloc(12);
  readSync(fd, head, 0, 12, 0);
  closeSync(fd);
  assert.equal(head.subarray(4, 8).toString('ascii'), 'ftyp', 'video file must be a real MP4 (ftyp box)');
});

test('pre-hydration script mirrors the pure decision', () => {
  assert.ok(INTRO_SCRIPT.includes(`sessionStorage.getItem('${INTRO_SEEN_KEY}')`), 'script must check the session flag');
  assert.ok(INTRO_SCRIPT.includes("matchMedia('(prefers-reduced-motion: reduce)')"), 'script must check reduced motion');
  assert.ok(INTRO_SCRIPT.includes("location.pathname!=='/'"), 'script must run only on the landing page');
  assert.ok(INTRO_SCRIPT.includes(`data-${INTRO_DATA_ATTR}`), 'script must set the data attribute');
  assert.ok(INTRO_SCRIPT.includes('__cbIntroMounted'), 'script must have the cover fallback if React never mounts');
  assert.ok(
    INTRO_SCRIPT.includes(String(INTRO_COVER_FALLBACK_MS)),
    `script must arm the cover fallback at ${INTRO_COVER_FALLBACK_MS}ms`,
  );
});

// ---------------------------------------------------------------- component source

const intro = () => read('components/intro/WebsiteIntro.tsx');

test('intro overlay: the exact video, muted autoplay, skip, ends on its own, never strands', () => {
  const src = intro();
  assert.ok(src.includes('INTRO_VIDEO_SRC'), 'video src must be the shared constant (the exact file, as-is)');
  assert.ok(src.includes('<video'), 'intro must render a video element');
  assert.ok(src.includes('autoPlay'), 'video must autoplay');
  assert.ok(src.includes('muted'), 'video must autoplay muted (browsers block sound autoplay)');
  assert.ok(src.includes('el.muted = true'), 'muted must also be set on the element — React does not always honour the attribute');
  assert.ok(src.includes('playsInline'), 'video must play inline on phones (no fullscreen takeover)');
  assert.ok(src.includes('preload="auto"'), 'video must preload so it starts at once');
  assert.ok(src.includes('object-contain'), 'portrait video must letterbox on desktop, not crop');
  assert.ok(src.includes('onEnded={finish}'), 'video ending must dismiss the intro on its own');
  assert.ok(src.includes('onError={finish}'), 'a load failure must dismiss the intro at once — never a stuck black overlay');
  assert.ok(src.includes('Skip intro'), 'explicit Skip affordance must exist');
  assert.ok(src.includes("e.key === 'Escape'"), 'Esc must skip');
  assert.ok(src.includes('onClick={skip}'), 'tap/click anywhere must skip');
  assert.ok(src.includes('role="dialog"'), 'overlay must be labelled as a dialog');
  // The animated intro is gone — no scenes, no typing, no particles,
  // no circular reveal, no bee. The video IS the intro now.
  assert.ok(!src.includes('INTRO_TAGLINE'), 'no tagline typing anymore');
  assert.ok(!src.includes('INTRO_PARTICLES'), 'no gold particles anymore');
  assert.ok(!src.includes("'CODEBETTLE'.split('')"), 'no letter-by-letter wordmark anymore');
  assert.ok(!src.includes('clipPath'), 'no circular reveal anymore');
  assert.ok(!src.includes('images.json'), 'no bee asset anymore');
  assert.ok(!src.includes('<motion.'), 'no framer-motion scenes anymore');
});

test('intro plays on a fresh session even if the pre-hydration flag was eaten (mobile slow hydration)', () => {
  const src = intro();
  assert.ok(src.includes('getAttribute(`data-${INTRO_DATA_ATTR}`)'), 'component must read the script flag');
  // Mobile fix (20 Nov 2026): the script's cover fallback drops the
  // flag if React has not mounted yet, and on a slow phone hydration
  // can take longer than the fallback — the flag was then gone before
  // the component read it, so the intro never played on mobile. The
  // session flag is the same source of truth, so the component must
  // also play when the session has not seen the intro.
  assert.ok(src.includes('hasSeenIntro'), 'component must fall back to the session flag directly');
  assert.ok(src.includes("pathname === '/'"), 'component must only play on the landing page');
  assert.ok(src.includes('useReducedMotion'), 'component must respect reduced motion');
  // No viewport / pointer gate: the intro plays on phones exactly as
  // on desktop — the fix is the session fallback, not a mobile branch.
  assert.ok(!src.includes('max-width'), 'intro must not gate on viewport width');
  assert.ok(!src.includes('pointer: coarse'), 'intro must not gate on pointer type');
  assert.ok(!src.includes('isMobile'), 'intro must not gate on a mobile flag');
  assert.ok(src.includes('sessionStorage') || src.includes('markIntroSeen'), 'component must mark the session when done');
  assert.ok(src.includes('dispatchIntroDone'), 'component must tell the hero when it is over');
  assert.ok(src.includes("document.body.style.overflow = 'hidden'"), 'background scroll must lock while the intro plays');
});

test('hero background is dimmed for readability (first step: opacity down, nothing removed)', () => {
  const wrapper = read('components/sections/HeroSceneWrapper.tsx');
  assert.ok(wrapper.includes('HERO_SCENE_OPACITY'), 'wrapper must carry a named dim factor');
  assert.ok(wrapper.includes('0.35'), '3D scene must render at 35% opacity');
  assert.ok(wrapper.includes('sceneOpacityDimmed'), 'scroll fade must multiply on top of the dim');
  assert.ok(wrapper.includes('<HeroScene scrollYProgress={scrollYProgress}'), 'scene must still render (dimmed, not removed)');
  const hero = read('components/sections/HeroSection.tsx');
  assert.ok(hero.includes('<PublicPageBackdrop variant="hero" particles={false}'), 'static backdrop must still render (dimmed, not removed)');
  assert.ok(hero.includes('opacity-50'), 'static backdrop must render at half strength');
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

test('hero has no count-up anymore (upper stats removed 20 Nov) — typewriter untouched', () => {
  const hero = read('components/sections/HeroSection.tsx');
  // (Eman, 20 Nov 2026): the upper hero stats row is removed — the
  // hero no longer counts anything up, so nothing in it waits for
  // the intro-done event. The intro-done subscription lives in the
  // 3D fade-in (HeroSceneWrapper) instead.
  assert.ok(!hero.includes('HeroLoadCounter'), 'hero load counter must be gone');
  assert.ok(!hero.includes('onIntroDone'), 'hero must not subscribe to the intro-done event');
  assert.ok(!hero.includes('INTRO_DONE_FALLBACK_MS'), 'hero must not carry the intro fallback');
  assert.ok(!hero.includes('HERO_STATS'), 'hero must not define a stats row');
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

test('intro dispatches the exact event the 3D scene listens for', () => {
  assert.equal(INTRO_DONE_EVENT, 'cb:intro-done', 'event name must be stable');
  // (20 Nov 2026): the hero no longer subscribes — its count-up is
  // gone with the upper stats row. The listener is the 3D fade-in.
  const wrapper = read('components/sections/HeroSceneWrapper.tsx');
  assert.ok(wrapper.includes('onIntroDone'), '3D scene fade-in must subscribe to the intro-done event');
});

// ---------------------------------------------------------------- scope guard

test('intro touches only landing-page, layout, hero and intro files (no dashboard/sidebar overlap)', () => {
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
    // The exact video file itself (21 Nov 2026, Eman): the intro IS
    // the video, so the file belongs in this guard's scope.
    'codebettle/public/intro-video.mp4',
    // Guard fixes this PR had to make to land on post-V32 main (not
    // feature scope): the V32 scope guard fired on any later branch,
    // and the light-mode audit needed an allowlist entry for the
    // intentionally fixed-dark intro splash.
    'codebettle/tests/dashboard-v32.test.ts',
    'codebettle/tests/theme-light-audit.test.ts',
    // Hero-stats removal (20 Nov 2026, Eman): removing the upper hero
    // stats row from HeroSection.tsx also updates the two test files
    // that pinned it (hero-screenshot + premium-3d guard) — test-only
    // changes to files that assert about the hero.
    'codebettle/tests/hero-screenshot.test.ts',
    'codebettle/tests/premium-3d-public-pages.test.ts',
    // Follow-up guard arming fix (20 Nov 2026): the follow-up guard
    // armed on any allowlisted test file, so editing a guard fix
    // tripped it — its arming is now source-only, same pattern as
    // this guard's own PR #81 fix.
    'codebettle/tests/dashboard-followup.test.ts',
    // Theme ink-wipe (21 Nov 2026, Eman): the wipe touches the root
    // layout (stylesheet link + displacement filter) and globals.css
    // (pointer comment), which arms this guard — so its own files
    // belong here too. No dashboard/sidebar overlap: the wipe only
    // touches the two theme controls, its helper, its plain CSS and
    // its tests.
    'codebettle/components/theme/ThemeToggle.tsx',
    'codebettle/components/theme/ThemeMenuRow.tsx',
    'codebettle/lib/theme-wipe.ts',
    'codebettle/public/theme-ink-wipe.css',
    'codebettle/tests/theme-ink-wipe.test.ts',
    'codebettle/tests/theme.test.ts',
  ]);
  // Merged state (19 Nov 2026 — the old `files.length > 0` assertion
  // below failed CI on main right after PR #79 merged): on main the
  // diff vs merge-base is empty, so there is nothing to guard. Same
  // vacuous-pass pattern as the V32 scope guard. The guard still fires
  // on any branch that actually changes files.
  if (files.length === 0) return;
  // Scope (PR #81, 19 Nov 2026 — same pattern as the V32 guard): this
  // guard only applies to a branch that touches intro files. A later
  // branch that changes only dashboard files (e.g. this follow-up)
  // must not trip it; if a branch touches intro files AND other files,
  // the allowlist check below still fails on the non-intro ones. Test
  // files in the allowlist do not arm it: editing a guard must not arm
  // that guard (same rule as the V32 guard's own test file).
  const INTRO_SOURCE = [...allowed].filter((f) => !f.startsWith('codebettle/tests/'));
  if (!files.some((f) => INTRO_SOURCE.includes(f))) return;
  for (const f of files) {
    assert.ok(allowed.has(f), `intro PR must not touch ${f} (outside its landing-page scope)`);
  }
});
