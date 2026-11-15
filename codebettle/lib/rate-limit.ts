/**
 * Rate limiter (Phase 3) — fixed-window, keyed per IP / IP+email.
 *
 * Two entry points with the SAME result shape ({ allowed, remaining,
 * resetAt }):
 *
 * - `checkRateLimit(key, limit, windowMs, now?)` — SYNCHRONOUS, backed
 *   by a process-local Map. This is the ORIGINAL Phase 1 API and its
 *   signature/behaviour are preserved exactly: it is the in-memory
 *   fallback inside `checkRateLimitAsync`, and the remaining direct
 *   call sites are the per-user upload limits (avatar / payment-proof),
 *   whose keys carry no IP at all. Its limitation is honest and
 *   unchanged: state lives in one server process, is lost on restart,
 *   and is NOT shared across Vercel instances — so on Vercel it
 *   throttles weakly (findings U-1 / HIGH-A3). New call sites MUST
 *   use `checkRateLimitAsync` instead.
 *
 * - `checkRateLimitAsync(key, limit, windowMs, now?)` — ASYNC. When
 *   `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set it
 *   counts in Upstash Redis via the REST API (shared across every
 *   Vercel instance, so the limit actually fires in production).
 *   When they are unset — or Redis is unreachable / errors — it falls
 *   back to the in-memory limiter and logs a warning, so the app
 *   never fails closed because the store is down. The Redis call is a
 *   plain HTTPS `fetch` against the Upstash REST `/pipeline`
 *   endpoint (INCR + PEXPIRE NX + PTTL in one round trip); there is
 *   no `@upstash/redis` dependency and no new credential is invented
 *   here — Eman must add the two env vars in Vercel for
 *   cross-instance enforcement to activate.
 *
 * `getClientIp()` (HIGH-A3 / U-2) is the single trusted-IP helper:
 * Vercel's `x-real-ip` first, else the LAST `x-forwarded-for` entry.
 * See its comment for why the FIRST entry must never be trusted.
 *
 * Backed by globalThis (not a plain module-level Map) so the
 * in-memory limiter is a true single-process singleton: Next.js
 * bundles each route separately and a module-level Map would be
 * per-bundle.
 */

interface Window {
  count: number;
  resetAt: number;
}

const globalForRateLimit = globalThis as unknown as {
  __cbRateLimitWindows?: Map<string, Window>;
};
const windows = (globalForRateLimit.__cbRateLimitWindows ??= new Map<string, Window>());

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/** Minimal header surface: works for NextRequest and plain test objects. */
export interface ClientIpRequest {
  headers: { get(name: string): string | null };
}

/**
 * Trusted client IP (HIGH-A3 / U-2).
 *
 * Why this order:
 * - `x-real-ip`: Vercel's own docs
 *   (vercel.com/docs/edge-network/headers) say this header is
 *   identical to `x-forwarded-for`, and that Vercel OVERWRITES
 *   `X-Forwarded-For` and "do[es] not forward external IPs … to
 *   prevent IP spoofing". So on Vercel neither header carries a
 *   client-supplied value: the edge sets them from the TCP peer it
 *   actually sees. `x-real-ip` is a single IP, so it is preferred.
 * - Otherwise the LAST `x-forwarded-for` entry, never the first.
 *   Each proxy in the chain appends the IP it saw; the leftmost
 *   entries are whatever the client sent (anyone can send
 *   `X-Forwarded-For: 1.2.3.4` and get a fresh rate-limit bucket
 *   per request), while the rightmost entry is the hop closest to
 *   our edge — appended by infrastructure the client cannot forge.
 *   (On Vercel itself the header holds a single, overwritten IP, so
 *   first == last there; the last-entry rule is what keeps the
 *   helper safe behind any extra proxy or in local dev.)
 * - No headers at all → 'unknown' (all such requests share one
 *   bucket, which is fail-closed for abuse and matches the old
 *   behaviour).
 */
export function getClientIp(request: ClientIpRequest): string {
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) {
    // Single IP by definition; take the first value if a proxy ever
    // comma-joins it.
    return realIp.split(',')[0]?.trim() || 'unknown';
  }
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last;
  }
  return 'unknown';
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): RateLimitResult {
  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

// ---------------------------------------------------------------------------
// Shared store: Upstash Redis via its REST API (no new dependency).
// Env vars are read per call (not at module load) so tests can set/unset
// them and a redeploy picks up a credential rotation without a rebuild.
// ---------------------------------------------------------------------------

interface UpstashConfig {
  url: string;
  token: string;
}

function getUpstashConfig(): UpstashConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

/** Which store the async limiter will use. Exported for tests / ops. */
export function getRateLimitBackend(): 'upstash' | 'memory' {
  return getUpstashConfig() ? 'upstash' : 'memory';
}

// Warning state lives on globalThis so the "not configured" warning is
// logged once per process, not once per rate-limited request.
const globalForRateLimitWarnings = globalThis as unknown as {
  __cbRateLimitWarnedMissingUpstash?: boolean;
  __cbRateLimitLastRedisErrorWarnAt?: number;
};

function warnMissingUpstashOnce(): void {
  if (globalForRateLimitWarnings.__cbRateLimitWarnedMissingUpstash) return;
  globalForRateLimitWarnings.__cbRateLimitWarnedMissingUpstash = true;
  console.warn(
    '[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set — ' +
      'using the in-memory limiter, which is NOT shared across Vercel instances. ' +
      'Set both vars in Vercel for cross-instance rate limiting.'
  );
}

function warnRedisErrorThrottled(error: unknown): void {
  const now = Date.now();
  const last = globalForRateLimitWarnings.__cbRateLimitLastRedisErrorWarnAt ?? 0;
  if (now - last < 60_000) return;
  globalForRateLimitWarnings.__cbRateLimitLastRedisErrorWarnAt = now;
  console.warn('[rate-limit] Upstash request failed, falling back to in-memory limiter:', error);
}

type UpstashPipelineEntry = { result?: unknown; error?: string | null };

/**
 * One fixed-window increment against Upstash, or null when Redis could
 * not be used (config missing, network error, non-OK status, malformed
 * response). Pipeline: INCR the key, PEXPIRE NX (set the window expiry
 * only when the key is fresh), PTTL (remaining window for resetAt).
 * Returns the same RateLimitResult shape as the in-memory limiter.
 */
async function checkRateLimitUpstash(
  key: string,
  limit: number,
  windowMs: number,
  now: number,
  config: UpstashConfig
): Promise<RateLimitResult | null> {
  const redisKey = `cb:ratelimit:${key}`;
  let res: Response;
  try {
    res = await fetch(`${config.url}/pipeline`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', redisKey],
        ['PEXPIRE', redisKey, windowMs, 'NX'],
        ['PTTL', redisKey],
      ]),
      // Never let a slow store hang the request: fall back to memory.
      signal: AbortSignal.timeout(2000),
    });
  } catch (error) {
    warnRedisErrorThrottled(error);
    return null;
  }
  if (!res.ok) {
    warnRedisErrorThrottled(`HTTP ${res.status}`);
    return null;
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch (error) {
    warnRedisErrorThrottled(error);
    return null;
  }
  const results = (data as { result?: unknown; error?: string | null } | null)?.result;
  if (!Array.isArray(results) || results.length < 3) {
    warnRedisErrorThrottled('malformed pipeline response');
    return null;
  }
  const [incr, , pttl] = results as UpstashPipelineEntry[];
  if (incr?.error || typeof incr?.result !== 'number') {
    warnRedisErrorThrottled(incr?.error ?? 'malformed INCR result');
    return null;
  }
  const count = incr.result;
  const ttlMs = typeof pttl?.result === 'number' ? pttl.result : -1;
  // PTTL -1 (no expiry — should not happen after PEXPIRE NX) or -2
  // (key vanished mid-flight): fall back to a full window.
  const resetAt = ttlMs >= 0 ? now + ttlMs : now + windowMs;
  if (count > limit) {
    return { allowed: false, remaining: 0, resetAt };
  }
  return { allowed: true, remaining: limit - count, resetAt };
}

/**
 * Async rate-limit check — the one new call sites should use.
 * Shared Upstash store when configured, in-memory fallback otherwise
 * (same windows, same result shape as `checkRateLimit`). A Redis
 * failure never blocks the request: it degrades to the in-memory
 * limiter, exactly like the missing-config case.
 */
export async function checkRateLimitAsync(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): Promise<RateLimitResult> {
  const config = getUpstashConfig();
  if (!config) {
    warnMissingUpstashOnce();
    return checkRateLimit(key, limit, windowMs, now);
  }
  const fromRedis = await checkRateLimitUpstash(key, limit, windowMs, now, config);
  if (fromRedis) return fromRedis;
  return checkRateLimit(key, limit, windowMs, now);
}

/** Login attempts: 5 per 15 minutes, keyed by IP + email. */
export function loginRateLimitKey(ip: string, email: string): string {
  return `login:${ip}:${email.toLowerCase()}`;
}

/** Password-reset requests: 5 per 15 minutes, keyed by IP + email. */
export function resetRateLimitKey(ip: string, email: string): string {
  return `reset:${ip}:${email.toLowerCase()}`;
}

/** Registrations: 5 per 15 minutes, keyed by IP (HIGH-A2). */
export function registerRateLimitKey(ip: string): string {
  return `register:${ip}`;
}

/** Password changes: 5 per 15 minutes, keyed by user (HIGH-A2). */
export function changePasswordRateLimitKey(userId: string): string {
  return `change-password:${userId}`;
}

/** Verification-email resends: 5 per 15 minutes, keyed by IP + email. */
export function resendVerificationRateLimitKey(ip: string, email: string): string {
  return `resend-verification:${ip}:${email.toLowerCase()}`;
}

/** First-run setup claims: 5 per 15 minutes, keyed by IP. */
export function setupRateLimitKey(ip: string): string {
  return `setup:${ip}`;
}

/** Contact-form submissions: 5 per 15 minutes, keyed by IP (spam guard). */
export function contactRateLimitKey(ip: string): string {
  return `contact:${ip}`;
}

/** Support-request submissions: 5 per 15 minutes, keyed by IP (spam guard). */
export function supportRequestRateLimitKey(ip: string): string {
  return `support-request:${ip}`;
}

/** Form submissions (public): 5 per 15 minutes, keyed by IP (spam guard). */
export function formSubmitRateLimitKey(ip: string): string {
  return `form-submit:${ip}`;
}

/** Application-file uploads: 10 per 15 minutes, keyed by IP (spam guard — files cost storage). */
export function applicationUploadRateLimitKey(ip: string): string {
  return `application-upload:${ip}`;
}

/** Success story submissions (public): 5 per 15 minutes, keyed by IP (spam guard). */
export function successStorySubmitRateLimitKey(ip: string): string {
  return `success-story-submit:${ip}`;
}

/** Newsletter subscriptions (public, footer): 5 per 15 minutes, keyed by IP (spam guard). */
export function subscribeRateLimitKey(ip: string): string {
  return `subscribe:${ip}`;
}

/** Book-a-call requests (public): 5 per 15 minutes, keyed by IP (spam guard). */
export function bookACallRateLimitKey(ip: string): string {
  return `book-a-call:${ip}`;
}

/** Ambassador applications (public): 5 per 15 minutes, keyed by IP (spam guard). */
export function becomeAmbassadorRateLimitKey(ip: string): string {
  return `become-ambassador:${ip}`;
}

/** Success story signed-upload requests: 20 per 15 minutes, keyed by IP (spam guard — files cost storage). */
export function successStoryUploadRateLimitKey(ip: string): string {
  return `success-story-upload:${ip}`;
}

/** Test helper: clear all windows (and reset the warning flags). Never call in production code. */
export function __clearRateLimits(): void {
  windows.clear();
  globalForRateLimitWarnings.__cbRateLimitWarnedMissingUpstash = false;
  globalForRateLimitWarnings.__cbRateLimitLastRedisErrorWarnAt = 0;
}
