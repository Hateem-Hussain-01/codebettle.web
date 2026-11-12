// Portal topbar dropdown guard.
//
// The ThemeToggle and UserMenu dropdowns are absolutely positioned
// inside the PortalLayout <header>. The header has backdrop-blur,
// which creates a stacking context with z-index auto — so it paints
// in DOM order, and the <main> element (which comes after it) used to
// paint OVER the open menu, clipping it mid-way (only the top option
// was visible). The header must carry an explicit z-index above the
// page content so both dropdowns render fully on top.
//
// This test guards the class layer only; the visual check still
// belongs on the live site (open the theme menu on a portal page and
// confirm all three options are visible above the page content).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'components/layout/PortalLayout.tsx'), 'utf8');

test('portal header carries a z-index so its dropdowns paint above <main>', () => {
  const headerMatch = src.match(/<header className="([^"]*)"/);
  assert.ok(headerMatch, 'PortalLayout must have a <header> with a className');
  const classes = headerMatch[1].split(/\s+/);
  assert.ok(classes.includes('relative'), 'portal header must be positioned (relative) for its z-index to apply');
  const zClass = classes.find((c) => /^z-\d+$/.test(c));
  assert.ok(zClass, 'portal header must carry an explicit z-* class above the page content');
  const zValue = Number(zClass.slice(2));
  assert.ok(zValue >= 10, `portal header z-index (${zValue}) must be above the page content (main has no z-index)`);
  assert.ok(zValue < 40, `portal header z-index (${zValue}) must stay below the mobile sidebar overlay (z-40) and sidebar (z-50)`);
});

test('portal header still keeps its backdrop-blur stacking context', () => {
  const headerMatch = src.match(/<header className="([^"]*)"/);
  assert.ok(headerMatch, 'PortalLayout must have a <header> with a className');
  assert.ok(
    headerMatch[1].includes('backdrop-blur'),
    'portal header must keep backdrop-blur (it is the stacking context the dropdowns live in)'
  );
});
