'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Sparkles } from '@react-three/drei';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { PageAccentLayout } from './PageAccentScene';

/**
 * Gold accent canvas for the About / Spotlight / Contact heroes —
 * fully-3D public site, Step 3 (Eman, 17 Nov 2026). A few small
 * gold shapes floating slowly at the hero edges plus a sparse gold
 * particle field. Never mounted directly (PageAccentScene lazy-loads
 * this with next/dynamic ssr:false and gates it on desktop + WebGL +
 * no reduced motion).
 *
 * Quiet on purpose: the shapes are small and dimmer than the Home
 * hero scene, they drift on drei Float (speed 0.5–0.7), and the
 * whole group only sways gently (rotation.y oscillates ±0.18 rad) —
 * no spin, no flashing. Dark + gold only (#F5C518 / #FDE68A theme
 * tokens).
 *
 * Cheap on purpose: 2–3 shapes, ~25 particles, dpr capped at 1.5,
 * and the render loop pauses (Canvas frameloop 'never') while the
 * hero is outside the viewport — an IntersectionObserver resumes it
 * when scrolled back into view.
 */

const GOLD = '#F5C518';
const GOLD_LIGHT = '#FDE68A';

type ShapeKind = 'icosahedron' | 'octahedron' | 'torus' | 'tetrahedron' | 'dodecahedron';

interface AccentShape {
  position: readonly [number, number, number];
  kind: ShapeKind;
  size: number;
  wireframe: boolean;
  speed: number;
}

/** Shape placement per page — always at the edges, never over the
 * centred hero text. About gets both edges, Spotlight the right,
 * Contact the left (sparser — a utilitarian page). */
const SHAPES_BY_LAYOUT: Record<PageAccentLayout, AccentShape[]> = {
  split: [
    { position: [-5.4, 1.2, -1.5], kind: 'icosahedron', size: 0.45, wireframe: false, speed: 0.6 },
    { position: [5.4, 1.4, -2], kind: 'octahedron', size: 0.5, wireframe: false, speed: 0.5 },
    { position: [5.0, -1.4, -2.5], kind: 'torus', size: 0.4, wireframe: false, speed: 0.7 },
  ],
  left: [
    { position: [-5.4, 1.2, -1.5], kind: 'tetrahedron', size: 0.55, wireframe: false, speed: 0.6 },
    { position: [-4.6, -1.5, -2.5], kind: 'icosahedron', size: 0.4, wireframe: true, speed: 0.5 },
  ],
  right: [
    { position: [5.4, 1.2, -1.5], kind: 'dodecahedron', size: 0.5, wireframe: false, speed: 0.6 },
    { position: [4.6, -1.6, -2], kind: 'octahedron', size: 0.45, wireframe: false, speed: 0.5 },
    { position: [5.8, 0.1, -3], kind: 'icosahedron', size: 0.7, wireframe: true, speed: 0.45 },
  ],
};

function AccentShape({ position, kind, size, wireframe, speed }: AccentShape) {
  const material = (
    <meshStandardMaterial
      color={GOLD}
      metalness={0.45}
      roughness={0.35}
      emissive={GOLD}
      emissiveIntensity={0.15}
      wireframe={wireframe}
      transparent={wireframe}
      opacity={wireframe ? 0.45 : 1}
    />
  );
  return (
    <Float speed={speed} rotationIntensity={0.3} floatIntensity={0.5} floatingRange={[-0.12, 0.12]}>
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

/** Gentle sway: the shape group rocks ±0.18 rad on a slow sine —
 * alive, but never spinning. */
function SwayGroup({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.12) * 0.18;
    }
  });
  return <group ref={ref}>{children}</group>;
}

export default function PageAccentSceneCanvas({ layout }: { layout: PageAccentLayout }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 10], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
        frameloop={inView ? 'always' : 'never'}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 6, 6]} intensity={1.2} color="#ffffff" />
        <pointLight position={[-4, 2, 2]} intensity={20} color={GOLD_LIGHT} />
        <SwayGroup>
          <Sparkles count={25} scale={[12, 6, 2]} size={2} speed={0.2} color={GOLD} opacity={0.5} />
          {SHAPES_BY_LAYOUT[layout].map((shape, i) => (
            <AccentShape key={i} {...shape} />
          ))}
        </SwayGroup>
      </Canvas>
    </div>
  );
}
