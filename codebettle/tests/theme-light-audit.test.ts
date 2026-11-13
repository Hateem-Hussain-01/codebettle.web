// Light-mode audit guards (Worker B).
//
// The theme system flips design tokens under [data-theme="light"], so
// every hardcoded dark colour that survives into light mode is a bug:
// white text on a white page, a gold button with white text, a dark
// surface that never inverts. These tests scan app/ + components/ and
// fail if any of those problems come back. Each rule has an explicit
// allowlist: every entry names the file, the exact class/value it
// covers, and the one-line reason it must stay fixed in both themes.
// If a new hardcoded colour is genuinely needed, add an allowlist
// entry with a reason — never silence a rule.
//
// The tests do not render pixels; they guard the class/style layer
// only. Visual light-mode checks still belong on the live site.
//
// NOT covered here (deliberately):
// - app/globals.css (.gradient-text has no light override yet —
//   Worker A owns globals.css; gold gradient text on white is ~1.6:1
//   and needs a token/override there, not a class change here).
// - The certificate print template (student-certificates-client) and
//   the Toaster iconTheme (app/layout.tsx): fixed dark by design, and
//   neither uses Tailwind colour classes or React style props, so
//   these rules do not match them.
// - lib/email templates: dark-only by design, out of scope.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['app', 'components'];

interface AllowEntry {
  file: string;
  match: string;
  reason: string;
}

// Every allowlist entry must still match something in the tree (the
// "allowlist entries are all still used" test enforces this), so stale
// entries get cleaned up instead of accumulating.
const ALLOWLIST: AllowEntry[] = [
  // Rule 1 — bare bg-black / bg-white / text-white / text-black.
  {
    file: 'components/layout/ViewAsBanner.tsx',
    match: 'bg-black text-white',
    reason: 'Fixed amber banner: the button stays black/white in both themes; no fixed-white text token exists.',
  },
  {
    file: 'app/admin/settings/page.tsx',
    match: 'bg-white',
    reason: 'Switch knob: white knob on the yellow/grey track in both themes.',
  },
  {
    file: 'app/blog/[slug]/page.tsx',
    match: 'bg-white',
    reason: 'PDF iframe backdrop: embedded PDF pages render white.',
  },
  {
    file: 'app/student/courses/[id]/student-course-content.tsx',
    match: 'text-white',
    reason: 'Join Live Class: white text on a fixed brand-blue button, readable in both themes.',
  },
  {
    file: 'app/student/courses/page.tsx',
    match: 'text-white',
    reason: 'Completed chip: white text on a fixed green-500 chip, readable in both themes.',
  },
  {
    file: 'components/ui/CourseCard.tsx',
    match: 'hover:bg-black',
    reason: 'Wishlist button over a photo thumbnail: dark scrim in both themes (photo, not a theme surface).',
  },
  {
    file: 'components/ui/CourseCard.tsx',
    match: 'text-white',
    reason: 'Wishlist heart: white icon on the dark photo scrim in both themes.',
  },
  // Rule 3 — hex colour literal inside a className value.
  {
    file: 'components/auth/AuthShell.tsx',
    match: 'linear-gradient(135deg,#FDE68A_0%,#F5C518_45%,#C9A000_100%)',
    reason: 'Gold overlay panel is intentionally fixed gold in both themes.',
  },
  // Rule 4 — hex colour literal inside an inline style prop.
  {
    file: 'app/admin/email-templates/email-template-editor-client.tsx',
    match: "backgroundColor: '#0A0A0A'",
    reason: 'Email preview iframe: emails are dark by design (dark + gold layout) and must preview on the dark surface in both themes.',
  },
  // Rule 5 — bare text-primary (bright gold text, unreadable on white).
  {
    file: 'components/auth/AuthShell.tsx',
    match: 'hover:text-primary',
    reason: 'Fixed gold panel: bright gold text on the ink hover state in both themes.',
  },
  {
    file: 'components/ui/CourseCard.tsx',
    match: 'fill-primary text-primary',
    reason: 'Gold heart on the dark photo scrim in both themes.',
  },
];

const allowed = (file: string, text: string) =>
  ALLOWLIST.some((e) => e.file === file && text.includes(e.match));

function collectTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectTsx(full, out);
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => collectTsx(join(root, d)));
const read = (full: string) => readFileSync(full, 'utf8');
const rel = (full: string) => relative(root, full).split('\\').join('/');

// JSX comments ({/* ... */}) and full-line // comments are stripped
// before the class rules run: the audit's own "why this stays fixed"
// comments name the classes they explain, and must not trip the rules.
function stripComments(content: string): string {
  return content
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split('\n')
    .map((line) => (line.trimStart().startsWith('//') ? '' : line))
    .join('\n');
}

interface Violation {
  file: string;
  line: number;
  text: string;
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function checkRule(
  pattern: RegExp,
  scope: 'lines' | 'className' | 'styleProps',
): Violation[] {
  const violations: Violation[] = [];
  for (const full of files) {
    const file = rel(full);
    const content = read(full);
    if (scope === 'lines') {
      const stripped = stripComments(content);
      stripped.split('\n').forEach((lineText, i) => {
        if (pattern.test(lineText)) {
          pattern.lastIndex = 0;
          if (!allowed(file, lineText)) {
            violations.push({ file, line: i + 1, text: lineText.trim() });
          }
        }
        pattern.lastIndex = 0;
      });
    } else if (scope === 'className') {
      const classNameRe =
        /className\s*=\s*(\{`[\s\S]*?`\}|\{'(?:[^'\\]|\\.)*'\}|\{"(?:[^"\\]|\\.)*"\}|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
      for (const m of content.matchAll(classNameRe)) {
        const value = m[1];
        if (pattern.test(value)) {
          pattern.lastIndex = 0;
          if (!allowed(file, value)) {
            violations.push({ file, line: lineOf(content, m.index ?? 0), text: value.trim().slice(0, 160) });
          }
        }
        pattern.lastIndex = 0;
      }
    } else {
      // style={{ ... }} props (also catches contentStyle={{ ... }}).
      const styleRe = /style=\{\{([\s\S]*?)\}\}/g;
      for (const m of content.matchAll(styleRe)) {
        if (pattern.test(m[1])) {
          pattern.lastIndex = 0;
          if (!allowed(file, m[1])) {
            violations.push({ file, line: lineOf(content, m.index ?? 0), text: m[1].trim().slice(0, 160) });
          }
        }
        pattern.lastIndex = 0;
      }
    }
  }
  return violations;
}

function assertNoViolations(rule: string, violations: Violation[]) {
  assert.equal(
    violations.length,
    0,
    `${rule} — ${violations.length} violation(s):\n` +
      violations.map((v) => `  ${v.file}:${v.line}: ${v.text}`).join('\n') +
      '\nFix by converting to a theme token, or add an allowlist entry with a reason if the colour must stay fixed in both themes.',
  );
}

// Bare solid black/white classes. Opacity variants (bg-black/60,
// bg-white/15) are overlays/scrims and are excluded by the lookahead —
// they stay dark in both themes by design.
const BARE_BLACK_WHITE = /\b(?:bg|text)-(?:black|white)(?![\w/-])/g;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

test('light-mode audit: no bare bg-black/bg-white/text-white/text-black outside the allowlist', () => {
  assertNoViolations(
    'bare black/white classes',
    checkRule(BARE_BLACK_WHITE, 'lines'),
  );
});

test('light-mode audit: no dark: variants (dead under the data-theme strategy)', () => {
  assertNoViolations('dark: variants', checkRule(/\bdark:/g, 'lines'));
});

test('light-mode audit: no hex colour literals in className values outside the allowlist', () => {
  assertNoViolations('hex in className', checkRule(HEX, 'className'));
});

test('light-mode audit: no hex colour literals in inline style props outside the allowlist', () => {
  assertNoViolations('hex in style props', checkRule(HEX, 'styleProps'));
});

test('light-mode audit: no bare text-primary outside the allowlist (use text-primary-text)', () => {
  assertNoViolations(
    'bare text-primary',
    checkRule(/\btext-primary(?![\w-])/g, 'lines'),
  );
});

test('light-mode audit: no text-dark anywhere (use text-ink for text that stays dark in both themes)', () => {
  assertNoViolations('text-dark', checkRule(/\btext-dark(?![\w-])/g, 'lines'));
});

test('light-mode audit: every allowlist entry still matches something', () => {
  const unused: AllowEntry[] = [];
  for (const entry of ALLOWLIST) {
    const haystacks = files
      .filter((f) => rel(f) === entry.file)
      .map((f) => read(f));
    if (!haystacks.some((h) => h.includes(entry.match))) unused.push(entry);
  }
  assert.equal(
    unused.length,
    0,
    'Stale allowlist entries (no longer found in the tree) — remove them:\n' +
      unused.map((e) => `  ${e.file}: ${e.match} (${e.reason})`).join('\n'),
  );
});
