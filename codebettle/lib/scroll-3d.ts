/**
 * Scroll-driven 3D mapping (Eman, 17 Nov 2026 — fully-3D public
 * site, Step 2). Pure functions, no React, no DOM — unit testable on
 * their own. HeroScene.tsx is the only consumer.
 *
 * `progress` is framer-motion's hero scroll progress: 0 when the
 * hero top meets the viewport top, 1 when the hero has scrolled fully
 * out of view (useScroll offset ['start start', 'end start']).
 * Everything is slow and small — the camera drifts through the scene
 * as the user scrolls, it never jumps or spins.
 */

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Camera dolly: the camera glides from z=10 toward z=7.5 as the hero
 * scrolls away — a gentle push into the scene, never a zoom. */
export function scrollCameraZ(progress: number): number {
  return 10 - clamp01(progress) * 2.5;
}

/** Scene-group rotation: the gold shapes turn at most ~0.35 rad
 * (20°) over the full scroll — a slow turn, not a spin. */
export function scrollGroupRotationY(progress: number): number {
  return clamp01(progress) * 0.35;
}

/** Scene fade: the canvas dissolves from fully visible to gone as
 * the hero scrolls away (fully gone at 90% scrolled) — the
 * background recedes while the hero content stays put. */
export function scrollSceneOpacity(progress: number): number {
  return clamp01(1 - clamp01(progress) / 0.9);
}

/** Pause: once the hero is fully out of view the scene's render loop
 * stops entirely (Canvas frameloop 'never') — no wasted GPU on a
 * scene nobody can see. Scrolling back up resumes it. */
export function isHeroScenePaused(progress: number): boolean {
  return progress >= 0.999;
}
