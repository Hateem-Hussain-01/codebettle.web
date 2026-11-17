// Hero 3D scene — fully-3D public site, Step 1 (Eman, 17 Nov 2026).
//
// The Home hero is a real React Three Fiber scene (floating gold
// shapes + gold particles, slow mouse-move camera parallax). These
// tests verify the wiring — the gating decision, the lazy load, the
// fallbacks, and that the scene is gold-only and slow — without
// rendering WebGL (no WebGL in jsdom; the scene is never mounted in
// tests). Visual verification against the rendered home page is in
// the PR body.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldRenderScene } from '../lib/hero-scene';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

// ---------------------------------------------------------------- gating

test('shouldRenderScene: desktop + WebGL + no reduced motion renders the scene', () => {
  assert.equal(
    shouldRenderScene({ reducedMotion: false, isMobile: false, webglSupported: true }),
    true,
  );
});

test('shouldRenderScene: reduced motion never renders the scene', () => {
  assert.equal(
    shouldRenderScene({ reducedMotion: true, isMobile: false, webglSupported: true }),
    false,
  );
});

test('shouldRenderScene: phones / coarse pointers get the static fallback', () => {
  assert.equal(
    shouldRenderScene({ reducedMotion: false, isMobile: true, webglSupported: true }),
    false,
  );
});

test('shouldRenderScene: no WebGL never renders the scene', () => {
  assert.equal(
    shouldRenderScene({ reducedMotion: false, isMobile: false, webglSupported: false }),
    false,
  );
});

// ---------------------------------------------------------------- scene wiring

test('HeroScene is a real R3F scene: gold shapes + particles + camera parallax', () => {
  const scene = read('components/sections/HeroScene.tsx');
  assert.ok(scene.includes("from '@react-three/fiber'"), 'scene must use React Three Fiber');
  assert.ok(scene.includes('Canvas'), 'scene must render a Canvas');
  assert.ok(scene.includes("from '@react-three/drei'"), 'scene must use drei helpers');
  assert.ok(scene.includes('Float'), 'shapes must drift with drei Float');
  assert.ok(scene.includes('Sparkles'), 'scene must have a gold particle field');
  assert.ok(scene.includes('useFrame'), 'camera parallax must run in useFrame');
  assert.ok(scene.includes('pointermove'), 'parallax must read the window pointer (the canvas is pointer-transparent)');
  assert.ok(scene.includes('#F5C518'), 'scene must be gold (#F5C518 theme token)');
  assert.ok(!scene.includes('#3B82F6'), 'scene must not introduce blue — dark + gold only');
});

test('HeroScene motion is slow and elegant, never fast', () => {
  const scene = read('components/sections/HeroScene.tsx');
  // Particle drift is slow (0.25); Float speeds are all under 1.
  assert.ok(scene.includes('speed={0.25}'), 'particles must drift slowly (speed 0.25)');
  assert.ok(!scene.includes('speed={2'), 'no fast Float speed may appear');
  assert.ok(!scene.includes('speed={3'), 'no fast Float speed may appear');
  // Camera lean is small (±0.7 / ±0.45) — depth, not seasickness.
  assert.ok(scene.includes('0.7'), 'camera x lean must stay small');
  assert.ok(scene.includes('0.45'), 'camera y lean must stay small');
});

test('HeroSceneWrapper lazy-loads the scene and gates it on motion / mobile / WebGL', () => {
  const wrapper = read('components/sections/HeroSceneWrapper.tsx');
  assert.ok(wrapper.includes("from 'next/dynamic'"), 'scene must be code-split with next/dynamic');
  assert.ok(wrapper.includes('ssr: false'), 'scene must not render server-side (WebGL is client-only)');
  assert.ok(wrapper.includes('useReducedMotion'), 'wrapper must respect reduced motion');
  assert.ok(wrapper.includes('pointer: coarse'), 'wrapper must fall back on coarse pointers (phones)');
  assert.ok(wrapper.includes('max-width: 768px'), 'wrapper must fall back on small screens');
  assert.ok(wrapper.includes('getContext'), 'wrapper must check WebGL support before mounting');
  assert.ok(wrapper.includes('shouldRenderScene'), 'wrapper must use the shared gating decision');
  assert.ok(wrapper.includes('return null'), 'fallback must render nothing (the static backdrop stays)');
});

test('hero mounts the scene wrapper behind the content, headline one line intact', () => {
  const hero = read('components/sections/HeroSection.tsx');
  assert.ok(hero.includes('HeroSceneWrapper'), 'hero must mount the scene wrapper');
  assert.ok(hero.includes('whitespace-nowrap'), 'typewriter headline must stay one line');
  assert.ok(hero.includes('text-[clamp(1.25rem,5.2vw,4.5rem)]'), 'headline must keep the fluid clamp size');
  assert.ok(hero.includes('TYPEWRITER_WORDS'), 'typewriter must stay');
  assert.ok(hero.includes('Become a'), 'hero headline must stay');
  assert.ok(hero.includes('Explore Courses'), 'hero CTA must stay');
});

// ---------------------------------------------------------------- dependencies

test('R3F stack is pinned in package.json (three + fiber + drei)', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.dependencies['three'], 'three must be a dependency');
  assert.ok(pkg.dependencies['@react-three/fiber'], '@react-three/fiber must be a dependency');
  assert.ok(pkg.dependencies['@react-three/drei'], '@react-three/drei must be a dependency');
  // Exact pins (save-exact) so a fresh install can never drift.
  assert.ok(!pkg.dependencies['three'].startsWith('^'), 'three must be pinned exact');
  assert.ok(!pkg.dependencies['@react-three/fiber'].startsWith('^'), 'fiber must be pinned exact');
  assert.ok(!pkg.dependencies['@react-three/drei'].startsWith('^'), 'drei must be pinned exact');
});
