/**
 * Admin base path — the secret admin URL (PR #33).
 *
 * The admin area lives at a SECRET random base path (e.g.
 * `/portal-xK9mQ2vR7tY4wN8sL3pZ6aB1cD5eF/...`) instead of `/admin`.
 * The value comes from the `ADMIN_BASE_PATH` env var (set in Vercel,
 * then redeploy — the rewrite in next.config.ts is built from it).
 * When the env var is absent (local dev, tests) the base path is the
 * dev-only default `admin`, so local development works unchanged.
 *
 * This is an EXTRA layer of obscurity, not a replacement for auth:
 * bots and scanners probing `/admin` / `/login` fail, and the login
 * page is not linked or indexed anywhere — but the real security is
 * still the bcrypt login, sessions, rate limiting and RBAC. The
 * secret must therefore NEVER appear in the sitemap, robots.txt, the
 * public navbar/footer, or any public JS bundle. Server code reads it
 * from this module; client code inside the admin portal gets it from
 * the AdminBasePathProvider (components/admin/AdminBasePathContext),
 * which the portal layout renders — never from process.env, which the
 * browser cannot see.
 *
 * Pure string helpers only — no Next.js imports, Edge-safe (the proxy
 * imports this module) and unit-testable in node.
 */

const DEV_DEFAULT_BASE_PATH = 'admin';

/** A base-path segment must be URL-safe: letters, digits, hyphens. */
function normaliseBasePath(raw: string | undefined): string {
  const cleaned = (raw ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!cleaned) return DEV_DEFAULT_BASE_PATH;
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(cleaned)) return DEV_DEFAULT_BASE_PATH;
  return cleaned;
}

/**
 * The admin area's URL base path (first path segment). Reads
 * `ADMIN_BASE_PATH`; `admin` when unset (local dev / tests).
 */
export function getAdminBasePath(): string {
  return normaliseBasePath(process.env.ADMIN_BASE_PATH);
}

/**
 * Full admin URL for an internal `/admin/...` path.
 * adminUrl('/dashboard') → `/<base>/dashboard`; adminUrl() → `/<base>`.
 */
export function adminUrl(path = ''): string {
  const base = getAdminBasePath();
  const p = path.startsWith('/') ? path : `/${path}`;
  return p === '/' ? `/${base}` : `/${base}${p}`;
}

/** Strip query string / hash from a pathname for prefix matching. */
function barePath(pathname: string): string {
  return pathname.split('?')[0].split('#')[0];
}

/** Is this pathname inside the admin area (the secret base path)? */
export function isAdminPath(pathname: string): boolean {
  const base = `/${getAdminBasePath()}`;
  const path = barePath(pathname);
  return path === base || path.startsWith(`${base}/`);
}

/** Is this the literal old `/admin` path (must not work any more)? */
export function isLegacyAdminPath(pathname: string): boolean {
  const path = barePath(pathname);
  return path === '/admin' || path.startsWith('/admin/');
}

/**
 * Convert an external admin pathname to its internal `/admin/...`
 * form, for the area guard (lib/admin-access.ts matches `/admin/...`
 * hrefs). Unknown paths pass through unchanged.
 */
export function toInternalAdminPath(pathname: string): string {
  const base = `/${getAdminBasePath()}`;
  const path = barePath(pathname);
  if (path === base) return '/admin';
  if (path.startsWith(`${base}/`)) return `/admin${path.slice(base.length)}`;
  return path;
}

/**
 * Convert an internal `/admin/...` href to its external (secret base
 * path) form, for rendering nav links and redirects. Unknown paths
 * pass through unchanged. In local dev (base 'admin') this is the
 * identity function.
 */
export function toExternalAdminPath(internalPath: string): string {
  const base = getAdminBasePath();
  const path = barePath(internalPath);
  if (path === '/admin') return `/${base}`;
  if (path.startsWith('/admin/')) return `/${base}${path.slice('/admin'.length)}`;
  return path;
}

/** Is this the secret admin sign-in page? */
export function isAdminSigninPath(pathname: string): boolean {
  return barePath(pathname) === adminUrl('/signin');
}

/**
 * Dashboard URL for a user's primary role. Admins land on the secret
 * admin dashboard (PR #33); everyone else on their portal dashboard.
 * Used by the login API so the client never has to build an admin URL
 * (it cannot read the env var).
 */
export function dashboardUrlForRole(role: string): string {
  if (role === 'admin') return adminUrl('/dashboard');
  if (role === 'instructor' || role === 'student') return `/${role}/dashboard`;
  return '/';
}
