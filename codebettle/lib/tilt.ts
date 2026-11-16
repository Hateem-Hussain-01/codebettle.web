/**
 * Pure tilt math for the premium 3D public pages (Eman, 16 Nov 2026).
 *
 * No React, no DOM — unit-testable on its own. TiltCard.tsx is the
 * only consumer.
 *
 * The card leans TOWARD the cursor: cursor at the top edge pulls the
 * top edge toward the viewer (negative rotateX), cursor at the right
 * edge pulls the right edge toward the viewer (negative rotateY).
 * The centre is always (0, 0) and the result is clamped to ±maxDeg.
 */
export interface TiltRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TiltAngles {
  rotateX: number;
  rotateY: number;
}

export function computeTilt(
  clientX: number,
  clientY: number,
  rect: TiltRect,
  maxDeg = 6,
): TiltAngles {
  if (rect.width <= 0 || rect.height <= 0) return { rotateX: 0, rotateY: 0 };
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  // Clamp AFTER scaling: a cursor outside the card must never tilt
  // past ±maxDeg (clamping the normalized value first would double
  // the angle — 2 * maxDeg — at the edges).
  const clampDeg = (v: number) => Math.max(-maxDeg, Math.min(maxDeg, v));
  return {
    rotateX: clampDeg((y - 0.5) * 2 * maxDeg),
    rotateY: clampDeg((0.5 - x) * 2 * maxDeg),
  };
}
