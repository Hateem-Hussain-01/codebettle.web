// Fully-3D Step 3 — About / Spotlight / Contact get their own 3D
// character (Eman, 17 Nov 2026).
//
// These tests verify the wiring — the accent scene gating and slow
// motion, the scroll-depth mapping and wrapper, the per-page wiring,
// and that the Spotlight stats and the Contact form are untouched —
// without rendering WebGL (no WebGL in jsdom; the scenes are never
// mounted in tests). Visual verification against the rendered pages
// is in the PR body.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sectionDepthRotation } from '../lib/section-depth';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

// ---------------------------------------------------------------- depth mapping

test('sectionDepthRotation: a section leans in 5°, settles flat, leans out −3°', () => {
  assert.equal(sectionDepthRotation(0), 5);
  assert.equal(sectionDepthRotation(0.25), 2.5);
  assert.equal(sectionDepthRotation(0.5), 0);
  assert.equal(sectionDepthRotation(0.75), -1.5);
  assert.equal(sectionDepthRotation(1), -3);
  // Out-of-range progress clamps — a fast scroll can never fling a section.
  assert.equal(sectionDepthRotation(-0.5), 5);
  assert.equal(sectionDepthRotation(2), -3);
});

// ---------------------------------------------------------------- accent scene

test('PageAccentScene is gated and code-split like the hero scene', () => {
  const scene = read('components/ui/PageAccentScene.tsx');
  assert.ok(scene.includes("from 'next/dynamic'"), 'accent scene must be code-split');
  assert.ok(scene.includes('ssr: false'), 'accent scene must not render server-side');
  assert.ok(scene.includes('shouldRenderScene'), 'accent scene must use the shared gating decision');
  assert.ok(scene.includes('useReducedMotion'), 'accent scene must respect reduced motion');
  assert.ok(scene.includes('pointer: coarse'), 'accent scene must fall back on coarse pointers (phones)');
  assert.ok(scene.includes('getContext'), 'accent scene must check WebGL support before mounting');
  assert.ok(scene.includes('PageAccentLayout'), 'accent scene must vary shape placement per page');
  assert.ok(scene.includes("'split' | 'left' | 'right'"), 'accent scene must offer split/left/right layouts');
});

test('PageAccentSceneCanvas is a slow gold R3F accent that pauses out of view', () => {
  const canvas = read('components/ui/PageAccentSceneCanvas.tsx');
  assert.ok(canvas.includes("from '@react-three/fiber'"), 'accent canvas must use React Three Fiber');
  assert.ok(canvas.includes('Float'), 'accent shapes must drift on drei Float');
  assert.ok(canvas.includes('Sparkles'), 'accent must carry a sparse gold particle field');
  assert.ok(canvas.includes('count={25}'), 'accent particles must stay sparse (25)');
  assert.ok(canvas.includes('speed={0.2}'), 'accent particles must drift slowly (speed 0.2)');
  assert.ok(canvas.includes("const GOLD = '#F5C518'"), 'accent gold must be the #F5C518 theme token');
  assert.ok(canvas.includes('color={GOLD}'), 'accent particles and shapes must use the gold token');
  assert.ok(!canvas.includes('#3B82F6'), 'accent must not introduce blue — dark + gold only');
  assert.ok(canvas.includes('IntersectionObserver'), 'accent must watch its own visibility');
  assert.ok(canvas.includes("frameloop={inView ? 'always' : 'never'}"), 'accent must pause its loop out of view');
  // Slow motion only: no Float speed above 0.7, no spin (the group
  // sways on a slow sine, it never rotates continuously).
  for (const m of canvas.matchAll(/speed:\s*([\d.]+)/g)) {
    assert.ok(Number(m[1]) <= 0.7, `accent Float speed must stay slow (got ${m[1]})`);
  }
  assert.ok(canvas.includes('Math.sin'), 'group sway must oscillate, not spin');
  assert.ok(canvas.includes('* 0.18'), 'group sway must stay small (±0.18 rad)');
  // One layout per page: both edges (About), left (Contact), right (Spotlight).
  assert.ok(canvas.includes('split:'), 'split layout must exist (About)');
  assert.ok(canvas.includes('left:'), 'left layout must exist (Contact)');
  assert.ok(canvas.includes('right:'), 'right layout must exist (Spotlight)');
});

// ---------------------------------------------------------------- section depth

test('SectionDepth drives a gentle rotateX from its own scroll progress', () => {
  const depth = read('components/ui/SectionDepth.tsx');
  assert.ok(depth.includes('useScroll'), 'depth must track its own scroll with useScroll');
  assert.ok(depth.includes("offset: ['start end', 'end start']"), 'progress must run 0 → 1 as the section crosses the viewport');
  assert.ok(depth.includes('sectionDepthRotation'), 'depth must use the shared rotation mapping');
  assert.ok(depth.includes('transformPerspective'), 'depth must render on a perspective stage');
  assert.ok(depth.includes('useReducedMotion'), 'depth must respect reduced motion');
  assert.ok(depth.includes('rotateX'), 'depth must lean the section (rotateX), not translate it');
});

// ---------------------------------------------------------------- per-page wiring

test('About: accent scene in the hero, depth on the team block', () => {
  const page = read('app/about/page.tsx');
  assert.ok(page.includes('<PageAccentScene layout="split"'), 'About hero must carry the split accent scene');
  assert.ok(page.includes('<SectionDepth>'), 'About team block must get scroll depth');
  const depthAt = page.indexOf('<SectionDepth>');
  const teamAt = page.indexOf('<TeamSection');
  const depthEnd = page.indexOf('</SectionDepth>');
  assert.ok(depthAt >= 0 && teamAt > depthAt && depthEnd > teamAt, 'SectionDepth must wrap the team section');
  // The mission/vision/values cards and team cards keep their tilt.
  assert.ok(page.includes('TiltCard'), 'About cards must keep their tilt');
});

test('Spotlight: accent scene in the hero, tilt on the stats, depth on stats + stories', () => {
  const page = read('app/success-stories/page.tsx');
  assert.ok(page.includes('<PageAccentScene layout="right"'), 'Spotlight hero must carry the right accent scene');
  assert.ok(page.includes('<TiltCard key={stat.label} max={5}>'), 'Spotlight stat cells must tilt gently (max 5°)');
  assert.equal(page.match(/<SectionDepth>/g)?.length, 2, 'Spotlight must wrap exactly two blocks in depth (stats + stories)');
  // The stats themselves are untouched: same settings values, same labels.
  assert.ok(page.includes('stats.activeStudents'), '1500+ Active Students must stay');
  assert.ok(page.includes('stats.certificatesIssued'), '300+ Certificates Issued must stay');
  assert.ok(page.includes('stats.averageRating'), '4.8 Average Rating must stay');
  assert.ok(page.includes('PAGE_STAT_LABELS'), 'stat labels must stay');
  // The CEO card and story cards keep their tilt.
  assert.ok(page.includes('TiltCard'), 'Spotlight cards must keep their tilt');
});

test('Contact: accent scene in the hero, backdrop behind the form, depth on the info column only', () => {
  const page = read('app/contact/page.tsx');
  assert.ok(page.includes('<PageAccentScene layout="left"'), 'Contact hero must carry the left accent scene');
  assert.ok(page.includes('<PublicPageBackdrop variant="hero" />'), 'Contact form area must sit on the shared backdrop');
  assert.equal(page.match(/<SectionDepth/g)?.length, 1, 'Contact must wrap exactly one block in depth (the info column)');
  const depthAt = page.indexOf('<SectionDepth');
  const infoAt = page.indexOf('Contact Information');
  const depthEnd = page.indexOf('</SectionDepth>');
  const formAt = page.indexOf('lg:col-span-3');
  assert.ok(depthAt >= 0 && infoAt > depthAt && depthEnd > infoAt && formAt > depthEnd, 'SectionDepth must wrap the info column, never the form');
  // The form itself stays static: no tilt while typing.
  assert.ok(page.includes('No mouse tilt here'), 'the form must stay tilt-free');
  assert.ok(page.includes('<form onSubmit={handleSubmit}'), 'the contact form must stay');
  // The info cards keep their tilt.
  assert.ok(page.includes('TiltCard'), 'Contact info cards must keep their tilt');
});

test('no new dependencies: Step 3 reuses the Step 1 R3F + framer-motion install', () => {
  const pkg = JSON.parse(read('package.json'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.ok(deps['three'], 'three must stay installed');
  assert.ok(deps['@react-three/fiber'], '@react-three/fiber must stay installed');
  assert.ok(deps['@react-three/drei'], '@react-three/drei must stay installed');
  assert.ok(!deps['gsap'], 'no new animation library — framer-motion only');
});
