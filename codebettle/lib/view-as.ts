/**
 * Admin-assisted "view as teacher" tokens (Phase 2, Module 21.4).
 *
 * Pure functions — no Next.js imports, unit-testable with the plain
 * Node test runner.
 *
 * Mechanism (see also lib/auth.ts `getSession` and the
 * `/api/admin/view-as` route):
 * - An admin mints a signed token for ONE teacher. The token is
 *   `base64url(payload).hex-hmac`, where the payload is
 *   `{ a: adminId, t: teacherId, e: expiresAtMs }`. The token lives for
 *   VIEW_AS_TTL_MS (30 minutes, ADM-02): the session ends when the
 *   token expires, or earlier when the admin clicks Exit, signs out,
 *   or closes the browser (the cookie is a browser-session cookie).
 *   The expiry is enforced server-side on every request
 *   (verifyViewAsToken); tokens minted before the TTL was added carry
 *   no `e` and are still honoured until the admin exits — they are
 *   rare (a mint lasts at most one viewing session) and cannot be
 *   renewed without a fresh admin mint.
 * - The signature is HMAC-SHA256 over the payload with a server-side
 *   secret. The secret is `VIEW_AS_SECRET` (or `SESSION_SECRET` when
 *   set); when neither is configured the secret is a random value
 *   generated once per server process — tokens then stop working on
 *   restart, which is safe for a viewing session but means a stable
 *   `VIEW_AS_SECRET` should be set in production (same place as the
 *   other server secrets, never committed, never in a NEXT_PUBLIC_
 *   variable).
 * - The token travels as an httpOnly, same-site cookie (`cb_view_as`)
 *   set by the mint route — never in a URL (URLs leak into logs and
 *   history) and never stored in the database. Ending the session is
 *   explicit: Exit (the exit route clears the cookie), logout, closing
 *   the browser, or the 30-minute token expiry (ADM-02).
 * - A token WITHOUT an expiry is rejected (LOW-A2): every token minted
 *   since the TTL was added carries one, and a pre-TTL token must not
 *   live forever. Verification is server-side only: `lib/auth.ts`
 *   re-checks the signature, that the admin in the token is the admin
 *   holding the session, and that the teacher still exists, is still
 *   a teacher (flag or legacy role) and is active. A forged or replayed
 *   token (different admin's session) verifies as null. A revoked
 *   teacher loses view-as immediately because the flag is re-checked
 *   on every request.
 * - The token carries NO password material and never creates, resets
 *   or exposes the teacher's password. It also never touches the
 *   session-revocation paths: the admin's own session stays intact
 *   and the teacher's sessions are untouched.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Name of the httpOnly cookie carrying the view-as token. */
export const VIEW_AS_COOKIE = 'cb_view_as';

/** How long a view-as token lives (ADM-02): 30 minutes from minting. */
export const VIEW_AS_TTL_MS = 30 * 60 * 1000;

export interface ViewAsPayload {
  /** Admin who minted the token. */
  adminId: string;
  /** Teacher whose portal is being viewed. */
  teacherId: string;
  /**
   * Epoch ms after which the token is dead (ADM-02: minted with
   * VIEW_AS_TTL_MS). REQUIRED — a token without an expiry is rejected
   * by verifyViewAsToken (LOW-A2); pre-TTL tokens are no longer
   * honoured. Every token minted by mintViewAsToken carries one.
   */
  expiresAt: number;
}

let fallbackSecret: Buffer | null = null;
let fallbackWarned = false;

/**
 * The HMAC secret: env first, else a random per-process value.
 * PRODUCTION REQUIREMENT (LOW-A2): set VIEW_AS_SECRET (or
 * SESSION_SECRET) as a stable env var in Vercel. Without it the secret
 * is random per process — tokens die on restart AND stop working
 * across Vercel instances, so view-as breaks for the admin. The
 * secret is never committed and never in a NEXT_PUBLIC_ variable.
 */
export function resolveViewAsSecret(): Buffer {
  const configured = process.env.VIEW_AS_SECRET ?? process.env.SESSION_SECRET;
  if (configured) return Buffer.from(configured, 'utf8');
  if (!fallbackSecret) fallbackSecret = randomBytes(32);
  if (!fallbackWarned) {
    fallbackWarned = true;
    console.warn(
      '[view-as] VIEW_AS_SECRET is not set — using a random per-process secret. ' +
        'View-as tokens will stop working on restart. Set VIEW_AS_SECRET in production.',
    );
  }
  return fallbackSecret;
}

function base64urlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64urlDecode(input: string): string | null {
  try {
    return Buffer.from(input, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Mint a signed token for `adminId` to view `teacherId`'s portal.
 * The token lives VIEW_AS_TTL_MS (ADM-02) — the session ends when it
 * expires, or earlier on Exit / logout / browser close. `nowMs` exists
 * so tests can mint at a fixed instant.
 */
export function mintViewAsToken(
  adminId: string,
  teacherId: string,
  secret: Buffer = resolveViewAsSecret(),
  nowMs: number = Date.now(),
): { token: string; expiresAt: number } {
  const expiresAt = nowMs + VIEW_AS_TTL_MS;
  const payload: ViewAsPayload = { adminId, teacherId, expiresAt };
  const encoded = base64urlEncode(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(encoded).digest('hex');
  return { token: `${encoded}.${signature}`, expiresAt };
}

/** Verify a token. Returns the payload, or null when forged, malformed or expired. */
export function verifyViewAsToken(
  token: string | undefined | null,
  nowMs: number = Date.now(),
  secret: Buffer = resolveViewAsSecret(),
): ViewAsPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(encoded).digest('hex');
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expBuf)) return null;
  const decoded = base64urlDecode(encoded);
  if (!decoded) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as ViewAsPayload).adminId !== 'string' ||
    typeof (payload as ViewAsPayload).teacherId !== 'string' ||
    ((payload as ViewAsPayload).expiresAt !== undefined &&
      typeof (payload as ViewAsPayload).expiresAt !== 'number')
  ) {
    return null;
  }
  const parsed = payload as ViewAsPayload;
  // LOW-A2: a token without an expiry is dead on arrival. Tokens
  // minted before the TTL was added carry no `e` and were previously
  // honoured until the admin exited — that meant a pre-TTL token
  // worked forever. Every token minted since carries an expiry.
  if (typeof parsed.expiresAt !== 'number') return null;
  if (parsed.expiresAt <= nowMs) return null;
  return parsed;
}
