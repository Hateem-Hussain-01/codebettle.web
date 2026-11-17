/**
 * Hero 3D scene gating (Eman, 17 Nov 2026 — fully-3D public site,
 * Step 1: the Home hero). Pure decision, no React, no DOM — unit
 * testable on its own. HeroSceneWrapper.tsx is the only consumer.
 *
 * The real WebGL scene renders ONLY when all three hold:
 * - the user has NOT asked for reduced motion,
 * - the device is NOT a small screen / coarse pointer (phones get the
 *   static PremiumBackdrop fallback so they stay fast),
 * - the browser actually supports WebGL (no WebGL = no scene, never
 *   a broken canvas or a thrown error).
 *
 * Anything else — reduced motion, mobile, no WebGL — renders the
 * static fallback (PremiumBackdrop, already on the page), so the hero
 * is never empty and never moves for people who asked it not to.
 */
export interface HeroSceneSupport {
  reducedMotion: boolean;
  isMobile: boolean;
  webglSupported: boolean;
}

export function shouldRenderScene(support: HeroSceneSupport): boolean {
  if (support.reducedMotion) return false;
  if (support.isMobile) return false;
  if (!support.webglSupported) return false;
  return true;
}
