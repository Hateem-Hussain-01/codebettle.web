// Invisible stats strip (Eman, 17 Nov 2026 — found by a desktop
// browser check: the home stats 1,500+ / 8+ / 300+ / 4.8 and the
// testimonial cards rendered as empty space, while their counters
// ran and the values sat in the DOM).
//
// ROOT CAUSE (proven in a real browser against a local build):
// TiltCard renders a plain div first, then flips to a motion.div
// tilt wrapper after hydration (fine-pointer check). When the direct
// child is itself a motion.div with `initial={{ opacity: 0 }}` (the
// stats fade, the testimonial fade), React REUSES that child instance
// as the tilt wrapper (same type, same position) — and framer-motion
// keeps the child's stale `initial` values on it. Observed computed
// values before the fix: the TiltCard wrapper sat at
// `opacity: 0; transform: perspective(1000px) translateY(20px)` for
// the stats (y: 30 for testimonials), while the child inside had
// correctly reached `opacity: 1` via its own whileInView. The whole
// card was invisible behind an opacity-0 ancestor.
//
// FIX: the tilt wrapper carries key="tilt-enabled", forcing a fresh
// mount on the flip, so the child mounts fresh inside it with its
// fade armed. These tests pin that key and the (unchanged) fade +
// values of both affected sections. Visual verification against a
// rendered page is in the PR body.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

// ---------------------------------------------------------------- TiltCard wrapper key

test('TiltCard: the tilt wrapper is keyed so it mounts fresh on the enabled flip', () => {
  const tilt = read('components/ui/TiltCard.tsx');
  // The inner motion.div (the one with the rotateX/rotateY springs)
  // must carry a key. Without it, React reuses a motion.div child as
  // this wrapper on the flip and the child's stale initial opacity 0
  // sticks to the wrapper forever — the stats strip and the
  // testimonial cards go invisible.
  assert.ok(
    tilt.includes('key="tilt-enabled"'),
    'TiltCard inner motion.div must have key="tilt-enabled" (fresh mount on flip)',
  );
  assert.ok(
    tilt.includes('rotateX: springX'),
    'TiltCard wrapper must still carry the tilt springs',
  );
});

// ---------------------------------------------------------------- Stats section (unchanged content)

test('StatsSection: stats still fade in inside TiltCard with real values', () => {
  const stats = read('components/sections/StatsSection.tsx');
  assert.ok(stats.includes('<TiltCard'), 'stats must stay inside TiltCard');
  assert.ok(
    stats.includes('whileInView={{ opacity: 1, y: 0 }}'),
    'stats fade must stay (the fade itself was never the bug)',
  );
  for (const needle of [
    'value: 1500',
    'value: 8',
    'value: 300',
    'value: 4.8',
    'Active Students',
    'Expert Courses',
    'Certificates Issued',
    'Average Rating',
    '<Counter',
  ]) {
    assert.ok(stats.includes(needle), `StatsSection must still contain: ${needle}`);
  }
});

// ---------------------------------------------------------------- Testimonials (same bug, same fix)

test('TestimonialsSection: cards still fade in inside TiltCard', () => {
  const testimonials = read('components/sections/TestimonialsSection.tsx');
  assert.ok(
    testimonials.includes('<TiltCard'),
    'testimonial cards must stay inside TiltCard',
  );
  assert.ok(
    testimonials.includes('whileInView={{ opacity: 1, y: 0 }}'),
    'testimonial fade must stay (same stale-opacity trap as the stats)',
  );
});
