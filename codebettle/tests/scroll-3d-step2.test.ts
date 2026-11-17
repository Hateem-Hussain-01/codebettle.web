// Fully-3D Step 2 — scroll-driven camera + tilt on cards + shared
// gold particle/grid backdrop (Eman, 17 Nov 2026).
//
// These tests verify the wiring — the scroll mapping, the camera
// dolly + pause, the tilt on all four card types, and the shared
// backdrop on all four public pages — without rendering WebGL (no
// WebGL in jsdom; the scenes are never mounted in tests). Visual
// verification against the rendered pages is in the PR body.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isHeroScenePaused,
  scrollCameraZ,
  scrollGroupRotationY,
  scrollSceneOpacity,
} from '../lib/scroll-3d';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

// ---------------------------------------------------------------- scroll mapping

test('scrollCameraZ: camera dollies gently in (z 10 → 7.5) as the hero scrolls away', () => {
  assert.equal(scrollCameraZ(0), 10);
  assert.equal(scrollCameraZ(0.5), 8.75);
  assert.equal(scrollCameraZ(1), 7.5);
  // Out-of-range progress clamps — a fast scroll can never fling the camera.
  assert.equal(scrollCameraZ(-0.5), 10);
  assert.equal(scrollCameraZ(2), 7.5);
});

test('scrollGroupRotationY: the shapes turn at most ~0.35 rad over the full scroll', () => {
  assert.equal(scrollGroupRotationY(0), 0);
  assert.equal(scrollGroupRotationY(0.5), 0.175);
  assert.equal(scrollGroupRotationY(1), 0.35);
  assert.equal(scrollGroupRotationY(-1), 0);
  assert.equal(scrollGroupRotationY(2), 0.35);
});

test('scrollSceneOpacity: the scene dissolves as the hero scrolls away (gone at 90%)', () => {
  assert.equal(scrollSceneOpacity(0), 1);
  assert.equal(scrollSceneOpacity(0.45), 0.5);
  assert.equal(scrollSceneOpacity(0.9), 0);
  assert.equal(scrollSceneOpacity(1), 0);
  assert.equal(scrollSceneOpacity(-0.2), 1);
});

test('isHeroScenePaused: the render loop stops only once the hero is fully out of view', () => {
  assert.equal(isHeroScenePaused(0), false);
  assert.equal(isHeroScenePaused(0.5), false);
  assert.equal(isHeroScenePaused(0.99), false);
  assert.equal(isHeroScenePaused(0.999), true);
  assert.equal(isHeroScenePaused(1), true);
});

// ---------------------------------------------------------------- scroll wiring

test('HeroSection drives the scene from its own scroll progress', () => {
  const hero = read('components/sections/HeroSection.tsx');
  assert.ok(hero.includes('useScroll'), 'hero must track its scroll with useScroll');
  assert.ok(hero.includes('heroRef'), 'useScroll must target the hero section');
  assert.ok(hero.includes("offset: ['start start', 'end start']"), 'progress must run 0 → 1 as the hero scrolls out');
  assert.ok(
    hero.includes('<HeroSceneWrapper scrollYProgress={scrollYProgress}'),
    'hero must pass its scroll progress to the scene wrapper',
  );
  // The hero itself is untouched: typewriter, copy, CTAs, one-line headline.
  assert.ok(hero.includes('whitespace-nowrap'), 'typewriter headline must stay one line');
  assert.ok(hero.includes('text-[clamp(1.25rem,5.2vw,4.5rem)]'), 'headline must keep the fluid clamp size');
  assert.ok(hero.includes('TYPEWRITER_WORDS'), 'typewriter must stay');
});

test('HeroSceneWrapper fades the scene with scroll and passes progress into the scene', () => {
  const wrapper = read('components/sections/HeroSceneWrapper.tsx');
  assert.ok(wrapper.includes('scrollYProgress'), 'wrapper must take the scroll progress');
  assert.ok(wrapper.includes('useTransform'), 'wrapper must map progress to opacity');
  assert.ok(wrapper.includes('scrollSceneOpacity'), 'wrapper must use the shared fade mapping');
  assert.ok(wrapper.includes('<HeroScene scrollYProgress={scrollYProgress}'), 'wrapper must pass progress into the scene');
  // Lazy load + gating from Step 1 must stay.
  assert.ok(wrapper.includes("from 'next/dynamic'"), 'scene must stay code-split');
  assert.ok(wrapper.includes('ssr: false'), 'scene must stay client-only');
  assert.ok(wrapper.includes('shouldRenderScene'), 'wrapper must keep the gating decision');
});

test('HeroScene dollies its camera with scroll and pauses when out of view', () => {
  const scene = read('components/sections/HeroScene.tsx');
  assert.ok(scene.includes('scrollCameraZ'), 'camera must dolly with the scroll mapping');
  assert.ok(scene.includes('scrollGroupRotationY'), 'shape group must turn with the scroll mapping');
  assert.ok(scene.includes('isHeroScenePaused'), 'scene must pause with the shared pause check');
  assert.ok(scene.includes("frameloop={paused ? 'never' : 'always'}"), 'canvas must stop its loop when paused');
  assert.ok(scene.includes('useMotionValueEvent'), 'pause must subscribe to the scroll value (it fires while the loop is stopped)');
  // Mouse parallax from Step 1 must stay.
  assert.ok(scene.includes('pointermove'), 'mouse camera parallax must stay');
  assert.ok(scene.includes('Sparkles'), 'gold particle field must stay');
});

// ---------------------------------------------------------------- tilt on cards

test('tilt is on all four card types: courses, team, testimonials, stats', () => {
  const courses = read('components/sections/featured-courses-client.tsx');
  assert.ok(courses.includes('TiltCard'), 'course cards must tilt');
  const team = read('components/sections/TeamSection.tsx');
  assert.ok(team.includes('TiltCard'), 'team cards must tilt');
  const testimonials = read('components/sections/TestimonialsSection.tsx');
  assert.ok(testimonials.includes('TiltCard'), 'testimonial cards must tilt');
  const reviews = read('components/sections/ReviewsCarousel.tsx');
  assert.ok(reviews.includes('TiltCard'), 'review cards must tilt');
  const stats = read('components/sections/StatsSection.tsx');
  assert.ok(stats.includes('TiltCard'), 'stat cards must tilt');
  assert.ok(stats.includes('max={5}'), 'stat tilt must stay subtle (max 5°)');
  // The stats themselves are untouched: numbers, labels, Counter.
  assert.ok(stats.includes('value: 1500'), '1500+ Active Students must stay');
  assert.ok(stats.includes('value: 8'), '8+ Expert Courses must stay');
  assert.ok(stats.includes('value: 300'), '300+ Certificates Issued must stay');
  assert.ok(stats.includes('value: 4.8'), '4.8 Average Rating must stay');
  assert.ok(stats.includes('function Counter'), 'animated counter must stay');
});

// ---------------------------------------------------------------- shared backdrop

test('PublicPageBackdrop is one shared component: static grid + lazy gold particles', () => {
  const backdrop = read('components/ui/PublicPageBackdrop.tsx');
  assert.ok(backdrop.includes('PremiumBackdrop'), 'backdrop must keep the static grid + glows as its base');
  assert.ok(backdrop.includes("from 'next/dynamic'"), 'particles must be code-split');
  assert.ok(backdrop.includes('ssr: false'), 'particles must not render server-side');
  assert.ok(backdrop.includes('shouldRenderScene'), 'backdrop must use the shared gating decision');
  assert.ok(backdrop.includes('useReducedMotion'), 'backdrop must respect reduced motion');
  assert.ok(backdrop.includes('pointer: coarse'), 'backdrop must fall back on coarse pointers (phones)');
  assert.ok(backdrop.includes('getContext'), 'backdrop must check WebGL support before mounting particles');
  assert.ok(backdrop.includes('return null') || backdrop.includes('showParticles'), 'fallback must render only the static backdrop');
});

test('PublicPageParticles is a slow gold R3F field that pauses out of view', () => {
  const particles = read('components/ui/PublicPageParticles.tsx');
  assert.ok(particles.includes("from '@react-three/fiber'"), 'particles must use React Three Fiber');
  assert.ok(particles.includes('Sparkles'), 'particles must be a Sparkles field');
  assert.ok(particles.includes("color=\"#F5C518\""), 'particles must be gold (#F5C518 theme token)');
  assert.ok(particles.includes('speed={0.2}'), 'particles must drift slowly (speed 0.2)');
  assert.ok(particles.includes('IntersectionObserver'), 'particles must watch their own visibility');
  assert.ok(particles.includes("frameloop={inView ? 'always' : 'never'}"), 'particles must pause their loop out of view');
  assert.ok(!particles.includes('#3B82F6'), 'particles must not introduce blue — dark + gold only');
});

test('the shared backdrop is on all four public pages, once each', () => {
  // Home: the hero uses it (particles off — the hero scene already
  // carries the particle field) and FeaturedCourses uses it (soft).
  const hero = read('components/sections/HeroSection.tsx');
  assert.ok(hero.includes('PublicPageBackdrop'), 'hero must use the shared backdrop');
  assert.ok(hero.includes('particles={false}'), 'hero must not mount a second particle canvas');
  const featured = read('components/sections/FeaturedCourses.tsx');
  assert.ok(featured.includes('PublicPageBackdrop'), 'featured courses must use the shared backdrop');
  assert.ok(!featured.includes('PremiumBackdrop'), 'featured courses must not keep the old backdrop too');
  // About, Spotlight (success-stories) and Contact: hero variant.
  for (const page of ['app/about/page.tsx', 'app/success-stories/page.tsx', 'app/contact/page.tsx']) {
    const src = read(page);
    assert.ok(src.includes('PublicPageBackdrop'), `${page} must use the shared backdrop`);
    assert.ok(!src.includes('PremiumBackdrop'), `${page} must not keep the old backdrop too`);
  }
  // The static base itself is not deleted — the shared component composes it.
  const base = read('components/ui/PremiumBackdrop.tsx');
  assert.ok(base.includes('linear-gradient'), 'PremiumBackdrop must keep its grid');
});
