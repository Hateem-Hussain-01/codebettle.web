/**
 * Admin-assisted "view as teacher" tokens (Phase 2, Module 21.4).
 *
 * Pure functions — no Next.js imports, unit-testable with the plain
 * Node test runner.
 *
 * Mechanism (see also lib/auth.ts `getSession` and the
 * `/api/admin/view-as` route):
 * - An admin mints a SHORT-LIVED (15 minute) signed token for ONE
 *   teacher. The token is `base64url(payload).hex-hmac`, where the
 *   payload is `{ a: adminId, t: teacherId, e: expiresAtMs }`.
 * - The signature is HMAC-SHA256 over the payload with a server-side
 *   secret. The secret is `VIEW_AS_SECRET` (or `SESSION_SECRET` when
 *   set); when neither is configured the secret is a random value
 *   generated once per server process — tokens then stop working on
 *   restart, which is safe for a 15-minute token but means a stable
 *   `VIEW_AS_SECRET` should be set in production (same place as the
 *   other server secrets, never committed, never in a NEXT_PUBLIC_
 *   variable).
 * - The token travels as an httpOnly, same-site cookie (`cb_view_as`)
 *   set by the mint route — never in a URL (URLs leak into logs and
 *   history) and never stored in the database (nothing to revoke: the
 *   15-minute expiry is the revocation).
 * - Verification is server-side only: `lib/auth.ts` re-checks the
 *   signature, the expiry, that the admin in the token is the admin
 *   holding the session, and that the teacher still exists, is still
 *   a teacher (flag or legacy role) and is active. A forged, expired
 *   or replayed token (different admin's session) verifies as null.
 * - The token carries NO password material and never creates, resets
 *   or exposes the teacher's password. It also never touches the
 *   session-revocation paths: the admin's own session stays intact
 *   and the teacher's sessions are untouched.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Name of the httpOnly cookie carrying the view-as token. */
export const VIEW_AS_COOKIE = 'cb_view_as';

/** A view-as token lives 15 minutes — long enough to inspect a portal, short enough to limit exposure. */
export const VIEW_AS_TTL_MS = 15 * 60 * 1000;

export interface ViewAsPayload {
  /** Admin who minted the token. */
  adminId: string;
  /** Teacher whose portal is being viewed. */
  teacherId: string;
  /** Epoch ms after which the token is dead. */
  expiresAt: number;
}

let fallbackSecret: Buffer | null = null;
let fallbackWarned = false;

/** The HMAC secret: env first, else a random per-process value. */
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

/** Mint a signed token for `adminId` to view `teacherId`'s portal. */
export function mintViewAsToken(
  adminId: string,
  teacherId: string,
  nowMs: number = Date.now(),
  secret: Buffer = resolveViewAsSecret(),
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
    typeof (payload as ViewAsPayload).expiresAt !== 'number'
  ) {
    return null;
  }
  const parsed = payload as ViewAsPayload;
  if (parsed.expiresAt <= nowMs) return null;
  return parsed;
}
