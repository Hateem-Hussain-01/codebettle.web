/**
 * Simple in-memory fixed-window rate limiter (Phase 1).
 * Protects login / register / password-reset routes against brute force.
 * Limitation, stated honestly: state lives in one server process and is
 * lost on restart, and it is not shared across instances. Phase 2 replaces
 * it with Upstash Redis (see .env.example) without changing call sites.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
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

/** Login attempts: 5 per 15 minutes, keyed by IP + email. */
export function loginRateLimitKey(ip: string, email: string): string {
  return `login:${ip}:${email.toLowerCase()}`;
}

/** Test helper: clear all windows. Never call in production code. */
export function __clearRateLimits(): void {
  windows.clear();
}
