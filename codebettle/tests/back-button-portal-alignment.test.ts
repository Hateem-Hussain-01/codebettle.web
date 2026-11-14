/**
 * Back button alignment on portal pages (Eman, 14 Nov 2026, with
 * screenshot): the "← Back" chip covered the page heading on every
 * admin page and the student's too (the "Quizzes" title sat under
 * the chip), and probably the trainer portal as well.
 *
 * Root cause: PortalLayout mounted BackButton as a FIXED chip at
 * top-[4.5rem] (72px), but the portal header is only h-14 (56px)
 * and the content starts at p-4 (16px) / sm:p-6 (24px), so the page
 * heading starts at 72px (mobile) / 80px (desktop) — exactly where
 * the ~28px-tall chip floated (72–100px).
 *
 * Fix: the portal mounts BackButton INLINE, in-flow in the header
 * bar (left side, next to the mobile menu button). In-flow it takes
 * a flex slot inside the h-14 header — a separate row above <main>
 * — so it structurally cannot overlap any page heading, on desktop
 * or mobile, at any scroll position. The fixed chip is kept for
 * public pages only, where the headings start far below it (main
 * pt-16 + hero py-16/20 ≈ 192px, the chip ends at ~108px).
 *
 * The BackButton is a client component (next/navigation) and cannot
 * be rendered in node, so the wiring is asserted by source
 * inspection, following the Phase 6 design-test pattern
 * (tests/phase6-design.test.ts) and the navbar test
 * (tests/navbar-back-to-dashboard.test.ts).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const backButton = read('components/layout/BackButton.tsx');
const portalLayout = read('components/layout/PortalLayout.tsx');
const navbar = read('components/layout/Navbar.tsx');

// ---------------------------------------------------------------------------
// BackButton: an inline (in-flow) variant exists, fixed stays the default
// ---------------------------------------------------------------------------

test('BackButton accepts an inline prop for in-flow mounting', () => {
  assert.ok(
    backButton.includes('inline = false'),
    'BackButton must take an optional inline prop defaulting to false',
  );
  assert.ok(
    backButton.includes('inline?: boolean'),
    'inline must be a typed boolean prop',
  );
});

test('inline BackButton renders in-flow — no fixed positioning', () => {
  // The inline branch must emit `relative` (in-flow) and never
  // `fixed`: cn() is a plain join (lib/utils.ts), so emitting both
  // would leave the winner to CSS order. The ternary guarantees
  // exactly one positioning mode.
  const inlineBranch = backButton.slice(backButton.indexOf("inline ? 'relative shrink-0'"));
  assert.ok(inlineBranch.length > 0, 'inline branch not found');
  assert.ok(
    inlineBranch.startsWith("inline ? 'relative shrink-0' : cn('fixed z-40'"),
    'inline must render relative/shrink-0, default must render the fixed chip',
  );
  // The old offset survives only in the doc comment above the
  // component (prose, not code). Scope the check to the code after
  // the comment block.
  const code = backButton.slice(backButton.indexOf('*/') + 2);
  assert.ok(!code.includes('top-[4.5rem]'), 'the old portal offset must not live in BackButton code');
});

test('BackButton behaviour is unchanged (back-or-home, hidden on /)', () => {
  assert.ok(backButton.includes("pathname === '/'"), 'must still hide on the home page');
  assert.ok(backButton.includes('router.back()'), 'must still go back in history');
  assert.ok(backButton.includes("router.push('/')"), 'must still go home with no history');
  assert.ok(backButton.includes('aria-label="Go back"'), 'accessible label must stay');
  // Same dark + gold chip styling.
  assert.ok(backButton.includes('rounded-full border border-dark-border'), 'chip styling must stay');
  assert.ok(backButton.includes('hover:text-primary-text'), 'gold hover must stay');
});

// ---------------------------------------------------------------------------
// PortalLayout: the Back button lives INSIDE the header, in-flow
// ---------------------------------------------------------------------------

test('portal mounts BackButton inline inside the header — no fixed chip over content', () => {
  // The old offset survives only in explanatory comments (the
  // header comment above the mount and BackButton's doc comment) —
  // no JSX mount may use it. Scope the check to mounts, not prose.
  assert.ok(
    !portalLayout.includes('<BackButton className='),
    'no fixed-position BackButton mount may remain in the portal',
  );
  assert.ok(
    !portalLayout.includes('className="top-[4.5rem]'),
    'no mount may use the old top-[4.5rem] offset',
  );
  assert.ok(
    portalLayout.includes('<BackButton inline />'),
    'portal must mount <BackButton inline />',
  );
  // The inline mount must sit inside the <header> element (before
  // its closing tag), in the left group with the mobile menu button
  // — in-flow in the h-14 bar, a separate flex row above <main>,
  // so it structurally cannot overlap a page heading.
  const headerStart = portalLayout.indexOf('<header');
  const headerEnd = portalLayout.indexOf('</header>', headerStart);
  assert.ok(headerStart > 0 && headerEnd > headerStart, 'header element not found');
  const header = portalLayout.slice(headerStart, headerEnd);
  assert.ok(header.includes('<BackButton inline />'), 'Back button must be inside the header');
  assert.ok(
    header.indexOf('<BackButton inline />') < header.indexOf('aria-label="Open menu"'),
    'Back button must sit left, next to (before) the mobile menu button',
  );
  assert.ok(header.includes('h-14'), 'header must stay h-14');
  // The header is above <main> in the layout: the button's flex
  // slot is in the header row, the page heading is in <main> below.
  // ('<main ' with a space: the header comment above mentions
  // "<main>" in prose, which must not match.)
  assert.ok(
    portalLayout.indexOf('</header>') < portalLayout.indexOf('<main '),
    'header (with the Back button) must come before <main>',
  );
});

test('portal header geometry: the chip fits the h-14 bar with room to spare', () => {
  // Chip height: py-1.5 (12px) + text-xs line (~16px) ≈ 28px.
  // Header height: h-14 = 56px. 28 < 56, so the chip fits inside
  // the bar with ~14px vertical margin — no overflow onto content.
  assert.ok(backButton.includes('px-3 py-1.5'), 'chip padding must stay py-1.5');
  assert.ok(backButton.includes('text-xs'), 'chip text must stay text-xs');
  assert.ok(portalLayout.includes('h-14'), 'portal header must stay h-14');
});

// ---------------------------------------------------------------------------
// Public pages: unchanged, and they do not overlap either
// ---------------------------------------------------------------------------

test('public navbar still mounts the default fixed BackButton', () => {
  assert.ok(navbar.includes('<BackButton />'), 'public navbar must still mount <BackButton />');
  assert.ok(!navbar.includes('<BackButton inline'), 'public pages must not use the inline variant');
});

test('public page headings start far below the fixed chip (no overlap)', () => {
  // Fixed chip: top-20 (80px) + ~28px tall → ends at ~108px.
  // Public pages: main pt-16 (64px, under the 64px navbar) + hero
  // py-16 (64px) or py-20 (80px) → the heading starts at ~192px
  // or later. 108px < 192px, so the chip sits in empty hero
  // padding, never over a title.
  assert.ok(backButton.includes("className ?? 'top-20 left-4'"), 'public default must stay top-20 left-4');
  for (const page of ['app/about/page.tsx', 'app/success-stories/page.tsx', 'app/contact/page.tsx', 'app/blog/page.tsx']) {
    const src = read(page);
    assert.ok(src.includes('pt-16'), `${page} must keep main pt-16 under the navbar`);
    assert.ok(
      src.includes('py-16') || src.includes('py-20'),
      `${page} hero must keep py-16/py-20 so its heading starts below the chip`,
    );
  }
});
