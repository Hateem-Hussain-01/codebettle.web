// Beetle loading effect (Eman, 20 Nov 2026 — "web mn koi loading
// effect bhi lagao beetle ko use krty howay").
//
// A small bee loader (the real CodeBettle bee, same embedded PNG as
// the intro) shows in the page content area while a portal segment
// loads, via loading.tsx. It never blocks the page: no full-screen
// overlay, no scroll lock, no artificial delay. Dark + gold only.
// The cursor is untouched (normal/default per Eman's standing
// decision) — this is a LOADING effect only.
//
// These tests pin the wiring (render + source-level, like the other
// guard tests). They do not render pixels — visual verification
// against a rendered repro page is in the PR body.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BeetleLoader from '../components/ui/BeetleLoader';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const src = read('components/ui/BeetleLoader.tsx');
// Doc comments explain what the loader does NOT do ("no scroll lock",
// "the cursor stays normal") — strip comments before the
// doesNotMatch assertions, same as the theme-light-audit does, so the
// explanations themselves cannot trip the rules.
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const LOADING_SEGMENTS = [
  'app/student/loading.tsx',
  'app/instructor/loading.tsx',
  'app/team/loading.tsx',
  'app/admin/loading.tsx',
];

// ---------------------------------------------------------------------------
// Render — the bee, the status role, the caption, no full-screen overlay
// ---------------------------------------------------------------------------

test('render: BeetleLoader renders the real bee, a status role and the caption', () => {
  // Effects never run under renderToStaticMarkup, so this is the
  // first-load (animated-branch) SSR output.
  const html = renderToStaticMarkup(React.createElement(BeetleLoader));
  assert.match(html, /role="status"/, 'loader must expose role=status');
  assert.match(html, /aria-label="Loading…"/, 'loader must label itself Loading');
  assert.match(html, /Loading…/, 'loader must show the Loading caption');
  assert.match(
    html,
    /src="data:image\/png;base64,/,
    'loader must render the bee as a bundled data URI (no network fetch)',
  );
  assert.match(html, /alt=""/, 'bee image is decorative — the status role carries the meaning');
});

test('render: BeetleLoader never renders a full-screen overlay', () => {
  const html = renderToStaticMarkup(React.createElement(BeetleLoader));
  assert.doesNotMatch(html, /fixed inset-0/, 'no fixed full-screen overlay — the page stays usable');
  assert.doesNotMatch(html, /position:\s*fixed/, 'no fixed positioning at all');
});

// ---------------------------------------------------------------------------
// Source — never blocks, no fake delay, reduced-motion safe, cursor untouched
// ---------------------------------------------------------------------------

test('source: BeetleLoader never locks scroll or invents a delay', () => {
  assert.doesNotMatch(code, /document\.body\.style\.overflow/, 'no scroll lock while loading');
  assert.doesNotMatch(code, /setTimeout/, 'no artificial waiting — instant navigations simply skip it');
  assert.doesNotMatch(code, /setInterval/, 'no timer of any kind');
});

test('source: BeetleLoader leaves the cursor alone', () => {
  assert.doesNotMatch(code, /cursor/, 'loading effect only — the cursor stays normal/default');
});

test('source: BeetleLoader uses the real bee and reads reduced motion in an effect', () => {
  assert.match(src, /images\.bee/, 'same embedded bee PNG as the intro — no invented mascot, no external image');
  assert.match(
    src,
    /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/,
    'reduced-motion preference is read live',
  );
  assert.match(src, /useEffect/, 'the preference is read in a post-mount effect (PageTransition pattern)');
  assert.doesNotMatch(code, /useReducedMotion/, 'never framer-motion useReducedMotion during render (SSR mismatch risk)');
  assert.match(src, /reduceMotion \?/, 'reduced motion renders the static bee, not the animated one');
});

test('source: BeetleLoader is dark + gold only (tokens, no new colours)', () => {
  assert.doesNotMatch(code, /#[0-9a-fA-F]{3,8}/, 'no hex colour literals — theme tokens only');
  assert.match(src, /bg-primary\/25/, 'gold glow from the primary token');
  assert.match(src, /text-muted/, 'caption in the muted token');
});

// ---------------------------------------------------------------------------
// Wiring — one loading.tsx per portal segment, all rendering the loader
// ---------------------------------------------------------------------------

test('wiring: every portal segment has a loading.tsx that renders BeetleLoader', () => {
  for (const file of LOADING_SEGMENTS) {
    assert.ok(existsSync(join(root, file)), `${file} must exist`);
    const text = read(file);
    assert.match(text, /import BeetleLoader from '@\/components\/ui\/BeetleLoader'/);
    assert.match(text, /export default function Loading\(\)/);
    assert.match(text, /<BeetleLoader \/>/);
    assert.doesNotMatch(text, /setTimeout|setInterval/, 'loading state adds no delay of its own');
  }
});

test('wiring: the loader sits inside the portal content area (sidebar + topbar stay mounted)', () => {
  // loading.tsx renders as PortalLayout's children — inside <main>,
  // below the header. The loader itself must not escape that box:
  // it is in-flow (flex) with a bounded height, never fixed.
  assert.match(src, /flex min-h-\[50vh\]/, 'loader is an in-flow centred block, not an overlay');
  assert.doesNotMatch(code, /absolute inset-0|fixed/, 'loader never positions itself over the chrome');
});

// ---------------------------------------------------------------------------
// Scope guard (same mechanism as the V32 / follow-up guards)
// ---------------------------------------------------------------------------

const BEETLE_ALLOWLIST = [
  'codebettle/components/ui/BeetleLoader.tsx',
  'codebettle/app/student/loading.tsx',
  'codebettle/app/instructor/loading.tsx',
  'codebettle/app/team/loading.tsx',
  'codebettle/app/admin/loading.tsx',
  'codebettle/tests/beetle-loading.test.ts',
];

function changedFiles(): string[] {
  const cmds = [
    'git diff --name-only origin/main...HEAD',
    'git diff --name-only',
    'git diff --name-only --cached',
  ];
  const out = new Set<string>();
  for (const cmd of cmds) {
    try {
      const res = execSync(cmd, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      for (const line of res.split('\n')) {
        const f = line.trim();
        if (f) out.add(f);
      }
    } catch {
      // No git available (or not a git checkout) — the manual diff
      // audit in the PR body is the backstop; do not fail the suite.
      return [];
    }
  }
  return [...out];
}

test('beetle scope: only the loader + the four portal loading.tsx + tests change', () => {
  const changed = changedFiles();
  if (changed.length === 0) return; // Merged state (empty diff) passes trivially.
  // The guard only applies to a branch that touches beetle files —
  // later branches (e.g. the intro or sidebar work) must not trip it.
  // The guard's own test file does not count: editing this guard must
  // not arm it.
  const beetleSource = BEETLE_ALLOWLIST.filter(
    (f) => f !== 'codebettle/tests/beetle-loading.test.ts',
  );
  if (!changed.some((f) => beetleSource.includes(f))) return;
  const outside = changed.filter((f) => !BEETLE_ALLOWLIST.includes(f));
  assert.equal(
    outside.length,
    0,
    'beetle loading must not touch files outside its scope (no intro, sidebar, portal chrome or pages):\n' +
      outside.map((f) => `  ${f}`).join('\n'),
  );
});
