'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Sparkles } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Home hero 3D scene — fully-3D public site, Step 1 (Eman, 17 Nov
 * 2026). React Three Fiber: floating gold shapes + a gold particle
 * field behind the hero content, with a slow mouse-move camera
 * parallax. Replaces the hero's old PR #60 motion (framer-motion
 * parallax layer, floating icons, TiltCard on the code window,
 * floating chips) — the typewriter headline, copy, CTAs and code
 * window are untouched.
 *
 * Professional, not busy: everything drifts slowly (Float speed
 * 0.5–0.8, particles at 0.25), the camera only leans ±0.7 / ±0.45,
 * no flashing, no fast spins. Dark + gold only (#F5C518 / #FDE68A
 * theme tokens).
 *
 * The canvas is pointer-transparent (the wrapper sets
 * pointer-events-none so the CTAs stay clickable), so the camera
 * parallax reads the pointer from a window listener instead of the
 * canvas's own pointer events.
 *
 * Never mounted directly: HeroSceneWrapper lazy-loads this with
 * next/dynamic ssr:false and only mounts it on desktop with WebGL
 * and no reduced-motion preference. Phones and reduced-motion users
 * get the static PremiumBackdrop fallback instead.
 */

const GOLD = '#F5C518';
const GOLD_LIGHT = '#FDE68A';

/** Floating gold shapes, kept at the edges so they never cover the
 * centred headline, CTAs or code window. */
const SHAPES = [
  { position: [-5.4, 1.9, -1.5] as const, kind: 'icosahedron' as const, size: 0.55, wireframe: false, speed: 0.6 },
  { position: [5.2, 2.1, -2] as const, kind: 'octahedron' as const, size: 0.62, wireframe: false, speed: 0.5 },
  { position: [-5.8, -1.6, -2.5] as const, kind: 'torus' as const, size: 0.5, wireframe: false, speed: 0.7 },
  { position: [5.6, -1.9, -1.8] as const, kind: 'tetrahedron' as const, size: 0.72, wireframe: false, speed: 0.55 },
  { position: [-4.2, 0.2, -3] as const, kind: 'icosahedron' as const, size: 0.9, wireframe: true, speed: 0.45 },
  { position: [4.4, -0.3, -3.2] as const, kind: 'dodecahedron' as const, size: 0.5, wireframe: true, speed: 0.5 },
];

function GoldShape({ position, kind, size, wireframe, speed }: (typeof SHAPES)[number]) {
  const material = (
    <meshStandardMaterial
      color={GOLD}
      metalness={0.45}
      roughness={0.35}
      emissive={GOLD}
      emissiveIntensity={0.18}
      wireframe={wireframe}
      transparent={wireframe}
      opacity={wireframe ? 0.45 : 1}
    />
  );
  return (
    <Float speed={speed} rotationIntensity={0.35} floatIntensity={0.5} floatingRange={[-0.15, 0.15]}>
      <mesh position={[position[0], position[1], position[2]]}>
        {kind === 'icosahedron' && <icosahedronGeometry args={[size, 0]} />}
        {kind === 'octahedron' && <octahedronGeometry args={[size, 0]} />}
        {kind === 'torus' && <torusGeometry args={[size, size * 0.32, 16, 48]} />}
        {kind === 'tetrahedron' && <tetrahedronGeometry args={[size, 0]} />}
        {kind === 'dodecahedron' && <dodecahedronGeometry args={[size, 0]} />}
        {material}
      </mesh>
    </Float>
  );
}

/** Normalised pointer target (-1..1), read from the window so the
 * parallax works even though the canvas itself is pointer-transparent. */
function usePointerTarget() {
  const target = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      target.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  return target;
}

/** Slow camera parallax: the camera leans a little toward the cursor
 * and eases back, so the scene has depth without ever feeling busy. */
function CameraRig({ target }: { target: React.RefObject<{ x: number; y: number }> }) {
  useFrame((state, delta) => {
    const camera = state.camera;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, target.current.x * 0.7, 2, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, target.current.y * 0.45, 2, delta);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function HeroScene() {
  const pointerTarget = usePointerTarget();

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 10], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 6, 6]} intensity={1.2} color="#ffffff" />
      <pointLight position={[-4, 2, 2]} intensity={20} color={GOLD_LIGHT} />
      {/* Gold particle field across the whole hero, drifting slowly. */}
      <Sparkles count={90} scale={[14, 7, 4]} size={2.5} speed={0.25} color={GOLD} opacity={0.55} />
      {SHAPES.map((shape, i) => (
        <GoldShape key={i} {...shape} />
      ))}
      <CameraRig target={pointerTarget} />
    </Canvas>
  );
}
