/**
 * Scroll-driven section depth (Eman, 17 Nov 2026 — fully-3D public
 * site, Step 3). Pure function, no React, no DOM — unit testable on
 * its own. SectionDepth.tsx is the only consumer.
 *
 * `progress` is framer-motion's section scroll progress: 0 when the
 * section top meets the viewport bottom, 0.5 when it is centred,
 * 1 when it has scrolled fully out of view (useScroll offset
 * ['start end', 'end start']). The section leans gently toward the
 * viewer as it enters (rotateX 5°), settles flat at the centre, and
 * leans slightly away as it leaves (−3°) — depth you feel, not
 * motion you notice. Small angles only: a section must never look
 * tilted, just deep.
 */

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Section rotateX in degrees: 5° on entry, 0° centred, −3° on exit. */
export function sectionDepthRotation(progress: number): number {
  const p = clamp01(progress);
  if (p <= 0.5) return 5 - (p / 0.5) * 5;
  return -((p - 0.5) / 0.5) * 3;
}
