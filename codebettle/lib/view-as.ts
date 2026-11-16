/**
 * Admin-assisted "view as" tokens (Phase 2, Module 21.4; extended
 * 16 Nov 2026 to ambassador portals).
 *
 * Pure functions — no Next.js imports, unit-testable with the plain
 * Node test runner.
 *
 * Mechanism (see also lib/auth.ts `getSession` and the
 * `/api/admin/view-as` routes):
 * - An admin mints a signed token for ONE person — a teacher
 *   (`kind: 'teacher'`) or an approved ambassador (`kind:
 *   'ambassador'`). The token is `base64url(payload).hex-hmac`,
 *   where the payload is `{ adminId, targetUserId, kind }`.
 * - NO TIME LIMIT (Eman, 16 Nov 2026 — this overrides ADM-02, the
 *   30-minute TTL the security remediation put on view-as tokens):
 *   the token carries no expiry and never expires on its own. The
 *   viewing session ends when the admin clicks Exit, signs out, or
 *   closes the browser (the cookie is a browser-session cookie).
 *   The remaining bounds are the ADMIN's own session: the token is
 *   re-validated on every request (signature, admin match, target
 *   still a teacher / still an active ambassador), so it dies the
 *   moment the admin's session ends (72h idle / 7-day absolute,
 *   PR #53) or the target loses their role. A token minted before
 *   the TTL removal (payload `{ adminId, teacherId, expiresAt }`)
 *   fails the shape check below and simply yields the admin
 *   session — it is never honoured.
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
 *   explicit: Exit (the exit route clears the cookie), logout, or
 *   closing the browser.
 * - Verification is server-side only: `lib/auth.ts` re-checks the
 *   signature, that the admin in the token is the admin holding the
 *   session, and that the target still exists, is still a teacher
 *   (flag or legacy role) or still an active ambassador, and is
 *   active. A forged or replayed token (different admin's session)
 *   verifies as null. A revoked teacher / deactivated ambassador
 *   loses view-as immediately because the role is re-checked on
 *   every request.
 * - The token carries NO password material and never creates, resets
 *   or exposes the target's password. It also never touches the
 *   session-revocation paths: the admin's own session stays intact
 *   and the target's sessions are untouched.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Name of the httpOnly cookie carrying the view-as token. */
export const VIEW_AS_COOKIE = 'cb_view_as';

/** Which portal a view-as token opens. */
export type ViewAsKind = 'teacher' | 'ambassador';

export interface ViewAsPayload {
  /** Admin who minted the token. */
  adminId: string;
  /** Teacher or ambassador whose portal is being viewed. */
  targetUserId: string;
  /** Which portal the token opens. */
  kind: ViewAsKind;
}

let fallbackSecret: Buffer | null = null;
let fallbackWarned = false;

/**
 * The HMAC secret: env first, else a random per-process value.
 * PRODUCTION REQUIREMENT: set VIEW_AS_SECRET (or SESSION_SECRET) as
 * a stable env var in Vercel. Without it the secret is random per
 * process — tokens die on restart AND stop working across Vercel
 * instances, so view-as breaks for the admin. The secret is never
 * committed and never in a NEXT_PUBLIC_ variable.
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
 * Mint a signed token for `adminId` to view `targetUserId`'s portal
 * (`kind` says which portal). The token carries NO expiry (Eman,
 * 16 Nov 2026 — the ADM-02 30-minute TTL is removed): it lives
 * until Exit / logout / browser close, bounded by the admin's own
 * session lifetime (see the module header).
 */
export function mintViewAsToken(
  adminId: string,
  targetUserId: string,
  kind: ViewAsKind,
  secret: Buffer = resolveViewAsSecret(),
): { token: string } {
  const payload: ViewAsPayload = { adminId, targetUserId, kind };
  const encoded = base64urlEncode(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(encoded).digest('hex');
  return { token: `${encoded}.${signature}` };
}

/**
 * Verify a token. Returns the payload, or null when forged,
 * malformed, or minted in the pre-removal format (which carried
 * `teacherId` + `expiresAt` instead of `targetUserId` + `kind`).
 * There is no expiry to check — a valid token verifies forever,
 * until the admin exits or their session ends (enforced in
 * lib/auth.ts on every request).
 */
export function verifyViewAsToken(
  token: string | undefined | null,
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
    typeof (payload as ViewAsPayload).targetUserId !== 'string' ||
    ((payload as ViewAsPayload).kind !== 'teacher' && (payload as ViewAsPayload).kind !== 'ambassador')
  ) {
    return null;
  }
  return payload as ViewAsPayload;
}
