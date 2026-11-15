import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'node:crypto';

/**
 * Pure security helpers. No Next.js imports here so this module is
 * unit-testable with the plain Node test runner.
 */

export const BCRYPT_COST = 12;
export const MIN_PASSWORD_LENGTH = 8;

/** Hash a plaintext password with bcrypt (cost 12). Never store or log the input. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * Constant-time password check. Returns false (never throws) for a
 * malformed stored hash so a corrupt record cannot crash login.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/**
 * A bcrypt hash (cost 12) of a random value, generated once with
 * bcryptjs — used to keep login timing uniform when the email does not
 * exist. It is a hash of an UNKNOWN random value, not a credential:
 * no password can ever match it, and it is never used to grant access.
 * The previous value was 62 chars (a valid bcrypt hash is 60), so
 * bcrypt.compare threw immediately and unknown-email logins returned
 * in ~0 ms vs ~500 ms for a real comparison (HIGH-A1 timing oracle).
 */
export const DUMMY_HASH = '$2b$12$HIjmbnAn678l2Sq0ErupSu/.K4iNixgblKn25IPEQBIF/v4kQEkDq';

/** Validate a new password. Returns an error message or null when valid. */
export function validatePassword(password: string): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

/** Normalise an email for storage and lookup (trim + lowercase). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Opaque, unguessable session token (64 hex chars). Only its SHA-256 hash is ever stored. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/** SHA-256 hash of a session token. The raw token is never stored or logged. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Allow only same-origin relative redirects (prevents the open-redirect on
 * login, where `?redirect=` was passed to the router unchecked).
 * Accepts "/student/dashboard"; rejects "//evil.com", "https://…", "javascript:…".
 */
export function getSafeRedirect(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || typeof raw !== 'string') return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (raw.includes('\\')) return fallback;
  try {
    const url = new URL(raw, 'http://localhost');
    if (url.origin !== 'http://localhost') return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Content-Security-Policy (Phase 7 — SEC-09).
// ---------------------------------------------------------------------------

/**
 * Build the Content-Security-Policy header value for one request.
 * Pure function — unit-tested. The proxy (proxy.ts) generates one fresh
 * nonce per request; Next.js reads the nonce out of the CSP header
 * during server rendering and stamps it on the framework's own inline
 * scripts, so a nonce-based policy works without 'unsafe-inline' on
 * script-src.
 *
 * Deliberate exception — style-src keeps 'unsafe-inline': React and
 * framer-motion set inline `style="..."` attributes, which a nonce
 * does NOT cover (nonces only apply to <style> blocks). A nonce-only
 * style-src would break the app's styling, so inline styles stay
 * allowed; scripts — the XSS vector that matters — are nonce-locked.
 *
 * img-src allows https: because course thumbnails (Unsplash) and
 * avatars (DiceBear) are hot-linked in the seed data (SEC-10, still
 * open as a dependency, documented in the runbook).
 * connect-src is 'self' only: no browser Supabase client exists in
 * this codebase (all Supabase access is server-side), so the browser
 * only ever talks to this origin.
 */
export function buildCspHeader(
  nonce: string,
  isDev = false,
  opts?: { allowFraming?: boolean },
): string {
  // Embed exemption (Forms GHL upgrade): the standalone embed render
  // (?embed=1 on /forms/[slug]) is designed to be framed by other
  // sites, so for that render ONLY frame-ancestors is '*' instead of
  // 'none'. Everything else keeps 'none' — see shouldAllowFraming()
  // and proxy.ts, which is the only caller that ever passes
  // allowFraming: true.
  const frameAncestors = opts?.allowFraming ? 'frame-ancestors *;' : "frame-ancestors 'none';";
  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''};
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https:;
    font-src 'self' data:;
    connect-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    ${frameAncestors}
    upgrade-insecure-requests;
  `;
  return csp.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Is this request the standalone embed render, which alone may be
 * framed? True only for a /forms/<slug> page request with exactly
 * `?embed=1`. Every other path — including /forms itself without the
 * param, and the admin preview (`?preview=1`) — stays unframeable.
 * Pure so the proxy and the tests share the rule.
 */
export function shouldAllowFraming(pathname: string, embedParam: string | null): boolean {
  return pathname.startsWith('/forms/') && pathname !== '/forms/' && embedParam === '1';
}

// ---------------------------------------------------------------------------
// Same-origin check (NEW-5 — CSRF defence-in-depth) + API CSP (NEW-10).
// ---------------------------------------------------------------------------

/**
 * True when a request is same-origin (or carries no Origin/Referer to
 * judge by). A cross-site form POST or fetch carries an Origin header
 * naming the attacker's site; a same-origin request names this app's
 * own origin. Requests with NO Origin and NO Referer (curl,
 * server-side fetches, non-browser clients) are allowed — the absence
 * of the header is not proof of forgery, and the SameSite=Lax session
 * cookie is the primary CSRF defence for those. A literal "null"
 * Origin (sandboxed iframe / file:// page) is never same-origin.
 *
 * `request` only needs `url` + `headers.get`, so the proxy (Edge) and
 * the API helpers (Node) share the rule — and unit tests can pass a
 * plain object.
 */
export function isSameOriginRequest(request: {
  url: string;
  headers: { get(name: string): string | null };
}): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const candidate = origin ?? referer;
  if (!candidate) return true;
  if (candidate === 'null') return false;
  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return false;
  }
  try {
    return new URL(candidate).origin === requestOrigin;
  } catch {
    return false;
  }
}

/**
 * Restrictive CSP for API + static responses (NEW-10). API responses
 * are JSON, never documents — but if one is ever navigated to directly
 * or served with a sniffable type, this stops it becoming an XSS
 * vector: nothing may load, nothing may frame it, and `sandbox`
 * treats it as a unique origin with no script execution. Static
 * assets loaded as subresources ignore this header; loaded directly
 * they render as inert text.
 */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; sandbox";

/** One fresh, unpredictable nonce per request (base64 of a UUID). */
export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}
