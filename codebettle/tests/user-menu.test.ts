// Profile avatar dropdown menu (UserMenu).
//
// Pure destination helper is unit-tested directly; the menu itself is
// tested with renderToStaticMarkup (UserMenu uses hooks, so it is
// rendered via createElement, not called as a plain function — the
// presentational-only components in public-forms.test.ts can be
// called directly, this one cannot). There is NO jsdom here, so
// outside-click / Escape / arrow-key behaviour is not DOM-tested:
// the handlers are in the component and the wiring is asserted from
// source below. A live-browser check of the open menu is still to be
// done separately — static markup proves the structure, not the
// interaction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { portalMenuLinks } from '../lib/user-menu';
import UserMenu from '../components/layout/UserMenu';
import { ThemeProvider } from '../components/theme/ThemeProvider';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const noop = () => {};
const user = { name: 'Ayesha Khan', email: 'ayesha@example.com' };

function renderMenu(props: Record<string, unknown> = {}): string {
  // ThemeMenuRow (inside the menu) reads useTheme(), so the menu
  // renders inside the provider — in node the provider falls back
  // to the 'system' preference with no document access.
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      null,
      createElement(UserMenu, {
        user,
        profileHref: '/admin/profile',
        settingsHref: '/admin/settings',
        onLogout: noop,
        ...props,
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// portalMenuLinks — pathname wins, role is the fallback
// ---------------------------------------------------------------------------

test('portalMenuLinks: current portal prefix in the pathname wins over the role', () => {
  // An applicant inside /applicant/... gets applicant links even
  // though their primary role is not 'applicant' — this is the whole
  // point of deriving from the pathname instead of portalFromPathname.
  assert.deepEqual(portalMenuLinks('/applicant/dashboard', 'student'), {
    profileHref: '/applicant/profile',
    settingsHref: '/applicant/profile',
  });
  // A dual-role teacher+admin switched into the admin portal gets
  // admin links, not instructor links.
  assert.deepEqual(portalMenuLinks('/admin/users', 'instructor'), {
    profileHref: '/admin/profile',
    settingsHref: '/admin/settings',
  });
  assert.deepEqual(portalMenuLinks('/instructor/courses', 'admin'), {
    profileHref: '/instructor/profile',
    settingsHref: '/instructor/profile',
  });
  assert.deepEqual(portalMenuLinks('/student/courses', 'admin'), {
    profileHref: '/student/profile',
    settingsHref: '/student/profile',
  });
});

test('portalMenuLinks: every portal prefix, bare prefix included', () => {
  assert.deepEqual(portalMenuLinks('/admin', 'student'), { profileHref: '/admin/profile', settingsHref: '/admin/settings' });
  assert.deepEqual(portalMenuLinks('/instructor', 'student'), { profileHref: '/instructor/profile', settingsHref: '/instructor/profile' });
  assert.deepEqual(portalMenuLinks('/student', 'admin'), { profileHref: '/student/profile', settingsHref: '/student/profile' });
  assert.deepEqual(portalMenuLinks('/applicant', 'student'), { profileHref: '/applicant/profile', settingsHref: '/applicant/profile' });
  // Query strings and hashes do not change the portal.
  assert.deepEqual(portalMenuLinks('/admin/settings?tab=x#top', 'student'), {
    profileHref: '/admin/profile',
    settingsHref: '/admin/settings',
  });
});

test('portalMenuLinks: null pathname falls back to the primary role', () => {
  assert.deepEqual(portalMenuLinks(null, 'admin'), { profileHref: '/admin/profile', settingsHref: '/admin/settings' });
  assert.deepEqual(portalMenuLinks(undefined, 'instructor'), { profileHref: '/instructor/profile', settingsHref: '/instructor/profile' });
  assert.deepEqual(portalMenuLinks('', 'student'), { profileHref: '/student/profile', settingsHref: '/student/profile' });
  assert.deepEqual(portalMenuLinks(null, 'applicant'), { profileHref: '/applicant/profile', settingsHref: '/applicant/profile' });
  // Public pages (no portal prefix) also fall back to the role.
  assert.deepEqual(portalMenuLinks('/courses', 'admin'), { profileHref: '/admin/profile', settingsHref: '/admin/settings' });
});

test('portalMenuLinks: unknown role lands on the student profile, never a dead link', () => {
  assert.deepEqual(portalMenuLinks(null, 'superadmin'), { profileHref: '/student/profile', settingsHref: '/student/profile' });
  assert.deepEqual(portalMenuLinks(null, ''), { profileHref: '/student/profile', settingsHref: '/student/profile' });
  assert.deepEqual(portalMenuLinks('/unknown/portal', 'bogus'), { profileHref: '/student/profile', settingsHref: '/student/profile' });
});

test('portalMenuLinks: settings falls back to the profile page where no settings page exists', () => {
  // Only /admin/settings exists. Every other portal's Settings item
  // must point at its profile page, never at a missing settings route.
  for (const [pathname, role] of [
    ['/instructor/dashboard', 'instructor'],
    ['/student/dashboard', 'student'],
    ['/applicant/dashboard', 'applicant'],
  ] as const) {
    const links = portalMenuLinks(pathname, role);
    assert.equal(links.settingsHref, links.profileHref, `${pathname} settings must equal profile`);
  }
});

// ---------------------------------------------------------------------------
// UserMenu rendering — closed by default
// ---------------------------------------------------------------------------

test('UserMenu closed: avatar button with menu affordances, no menu items', () => {
  const html = renderMenu();
  assert.match(html, /aria-haspopup="menu"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-label="Account menu for Ayesha Khan"/);
  // DiceBear initials fallback when no avatar is set (same URL shape
  // PortalLayout used for the plain avatar link).
  assert.ok(html.includes('api.dicebear.com/7.x/initials/svg?seed=Ayesha'), 'DiceBear fallback src');
  assert.doesNotMatch(html, /role="menu"/);
  assert.doesNotMatch(html, /href="\/admin\/profile"/);
  assert.doesNotMatch(html, />Profile</);
  assert.doesNotMatch(html, />Settings</);
  assert.doesNotMatch(html, />Logout</);
});

test('UserMenu controlled-open: Profile/Settings/Logout with the exact hrefs passed in', () => {
  const html = renderMenu({ open: true, onOpenChange: noop });
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /role="menu"/);
  assert.match(html, /href="\/admin\/profile"/);
  assert.match(html, /href="\/admin\/settings"/);
  assert.match(html, />Profile</);
  assert.match(html, />Settings</);
  assert.match(html, />Logout</);
  // Header shows name + email only (no role).
  assert.match(html, /Ayesha Khan/);
  assert.match(html, /ayesha@example\.com/);
});

test('UserMenu controlled-open: custom hrefs are honoured (instructor/applicant destinations)', () => {
  const links = portalMenuLinks('/applicant/dashboard', 'student');
  const html = renderMenu({ open: true, onOpenChange: noop, profileHref: links.profileHref, settingsHref: links.settingsHref });
  assert.match(html, /href="\/applicant\/profile"/);
  assert.doesNotMatch(html, /href="\/applicant\/settings"/);
});

// ---------------------------------------------------------------------------
// Theme row — compact icon switcher inside the menu (Eman, 20 Nov 2026)
// ---------------------------------------------------------------------------

test('UserMenu controlled-open: compact Theme row with three icon buttons, above Logout', () => {
  const html = renderMenu({ open: true, onOpenChange: noop });
  // Short label only — no explanatory paragraph, no long text.
  assert.match(html, />Theme</);
  assert.doesNotMatch(html, /click the icon/);
  assert.doesNotMatch(html, /Choose how the website looks/);
  assert.doesNotMatch(html, /Default \(system\)/);
  // The three options are icon buttons (Moon / Sun / Monitor).
  assert.match(html, /aria-label="Dark theme"/);
  assert.match(html, /aria-label="Light theme"/);
  assert.match(html, /aria-label="System theme"/);
  // In node the provider falls back to the 'system' preference, so
  // the Monitor button is the checked one.
  assert.match(html, /aria-label="System theme"[^>]*aria-checked="true"|aria-checked="true"[^>]*aria-label="System theme"/);
  // The row sits above Logout (it is rendered before it in the menu).
  assert.ok(
    html.indexOf('aria-label="Dark theme"') < html.indexOf('>Logout<'),
    'theme row must sit above Logout',
  );
});

test('UserMenu closed: no theme row rendered', () => {
  const html = renderMenu();
  assert.doesNotMatch(html, /aria-label="Dark theme"/);
  assert.doesNotMatch(html, /aria-label="System theme"/);
  assert.doesNotMatch(html, />Theme</);
});

test('UserMenu: a set avatar is used instead of the DiceBear fallback', () => {
  const html = renderMenu({
    open: true,
    onOpenChange: noop,
    user: { name: 'Ayesha Khan', email: 'ayesha@example.com', avatar: 'https://cdn.example.com/avatars/ayesha.png' },
  });
  assert.ok(html.includes('https://cdn.example.com/avatars/ayesha.png'), 'avatar src used');
  assert.doesNotMatch(html, /dicebear\.com/);
});

test('UserMenu: no email renders the name header without an email line', () => {
  const html = renderMenu({ open: true, onOpenChange: noop, user: { name: 'Ayesha Khan' } });
  assert.match(html, /Ayesha Khan/);
  assert.doesNotMatch(html, /@/);
});

// ---------------------------------------------------------------------------
// Source guards — wiring in PortalLayout / Navbar, interaction handlers
// ---------------------------------------------------------------------------

test('PortalLayout: avatar is a UserMenu, not the plain profile Link; bell + sidebar logout untouched', () => {
  const layout = read('components/layout/PortalLayout.tsx');
  assert.match(layout, /import UserMenu from '@\/components\/layout\/UserMenu'/);
  assert.match(layout, /import \{ portalMenuLinks \} from '@\/lib\/user-menu'/);
  assert.match(layout, /<UserMenu user=\{user\} profileHref=\{links\.profileHref\} settingsHref=\{links\.settingsHref\} onLogout=\{handleLogout\} \/>/);
  assert.match(layout, /portalMenuLinks\(pathname, user\.role, adminBasePath\)/);
  assert.doesNotMatch(layout, /<Link href=\{`\/\$\{portalSlug\}\/profile`\}>/);
  // Bell still uses the current portal's base (PR #33: portalBase —
  // the secret base path for admin, the portal slug otherwise). Its
  // fallback is load-bearing in the applicant portal — see
  // lib/user-menu.ts.
  assert.match(layout, /href=\{`\$\{portalBase\}\/notifications`\}/);
  // Sidebar Sign Out still uses the same (now hoisted) logout —
  // since 18 Nov 2026 it lives in CollapsibleSidebar and PortalLayout
  // passes the shared handleLogout down as onLogout.
  assert.match(layout, /async function handleLogout\(\)/);
  assert.doesNotMatch(layout, /const handleLogout = async/);
  assert.match(layout, /<CollapsibleSidebar[^>]*onLogout=\{handleLogout\}/);
  const sidebar = read('components/layout/CollapsibleSidebar.tsx');
  assert.match(sidebar, /Sign Out/);
  assert.match(sidebar, /onClick=\{onLogout\}/);
});

test('Navbar: logged-in desktop shows UserMenu; Login/Get Started stay for guests; mobile portal button kept', () => {
  const navbar = read('components/layout/Navbar.tsx');
  assert.match(navbar, /import UserMenu from '@\/components\/layout\/UserMenu'/);
  assert.match(navbar, /import \{ portalMenuLinks \} from '@\/lib\/user-menu'/);
  assert.match(navbar, /portalMenuLinks\(null, session\.role\)/);
  assert.match(navbar, /<UserMenu/);
  assert.match(navbar, /email\?: string/);
  // Logged-out desktop still offers Login / Get Started.
  assert.match(navbar, /Login/);
  assert.match(navbar, /Get Started/);
  // The bare portal Button (Admin Panel / Dashboard / My Learning) is
  // gone from the desktop auth area; the mobile "Back to Dashboard"
  // button is intentionally kept (renamed from "Go to Portal" on
  // 14 Nov 2026 so the mobile wording matches the desktop button).
  assert.doesNotMatch(navbar, /Admin Panel/);
  assert.doesNotMatch(navbar, /My Learning/);
  assert.doesNotMatch(navbar, /Go to Portal/);
  assert.match(navbar, /Back to Dashboard/);
});

test('UserMenu source: outside-click + Escape close, arrow keys move between items', () => {
  const menu = read('components/layout/UserMenu.tsx');
  assert.match(menu, /'use client'/);
  assert.match(menu, /document\.addEventListener\('mousedown'/);
  assert.match(menu, /e\.key === 'Escape'/);
  assert.match(menu, /buttonRef\.current\?\.focus\(\)/);
  assert.match(menu, /ArrowDown/);
  assert.match(menu, /ArrowUp/);
  assert.match(menu, /aria-haspopup="menu"/);
  assert.match(menu, /AnimatePresence/);
  assert.match(menu, /role="menuitem"/);
});

test('ThemeMenuRow source: same theme behaviour as ThemeToggle, inline icons, menu stays open', () => {
  const row = read('components/theme/ThemeMenuRow.tsx');
  // Same hook, same three preferences, same cookie-persisted setter
  // as ThemeToggle — only the presentation changed (inline icons in
  // the avatar menu instead of a floating dropdown).
  assert.match(row, /useTheme\(\)/);
  assert.match(row, /setPreference\(option\)/);
  assert.match(row, /'dark'/);
  assert.match(row, /'light'/);
  assert.match(row, /'system'/);
  // The buttons are radio items, NOT menuitem: the menu's ArrowUp /
  // ArrowDown handler walks [role="menuitem"] only, so it steps over
  // the theme group as one block instead of landing on each icon.
  assert.match(row, /role="menuitemradio"/);
  assert.doesNotMatch(row, /role="menuitem"/);
  // Picking a theme must NOT close the menu: the row calls
  // setPreference only — setOpen lives in UserMenu, not here.
  assert.doesNotMatch(row, /setOpen/);
  // No nested floating menu: no AnimatePresence, no absolute
  // positioning — the icons sit inline in the UserMenu.
  assert.doesNotMatch(row, /AnimatePresence/);
  assert.doesNotMatch(row, /absolute/);
  // Compact by design: short label, three icon buttons, no long text.
  assert.match(row, />Theme</);
  assert.doesNotMatch(row, /click the icon/);
  assert.doesNotMatch(row, /Choose how the website looks/);
  // Active option gets the gold treatment (primary-text token — the
  // readable gold on light surfaces; bare text-primary is banned by
  // the theme conversion guard).
  assert.match(row, /text-primary-text/);
});

test('UserMenu source: arrow-key nav walks menuitem only, theme row is a menuitemradio group', () => {
  const menu = read('components/layout/UserMenu.tsx');
  assert.match(menu, /querySelectorAll<HTMLElement>\('\[role="menuitem"\]'\)/);
  assert.doesNotMatch(menu, /menuitemradio/);
  assert.match(menu, /import ThemeMenuRow from '@\/components\/theme\/ThemeMenuRow'/);
  assert.match(menu, /<ThemeMenuRow \/>/);
});
