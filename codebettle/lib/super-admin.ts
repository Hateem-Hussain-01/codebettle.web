/**
 * Super-admin identity (Phase 5, Module 23 — Super Admin & Audit).
 *
 * The two official administrators (OFFICIAL_ADMINS in
 * lib/services/first-run.ts) are the super-admins. There is no separate
 * super-admin table or flag: super-admin status is the email, checked
 * case-insensitively. This is the single source of truth for the
 * Phase 5 workers (audit API/routes, admin layout gating) — every
 * super-admin check goes through isSuperAdmin / isSuperAdminEmail.
 *
 * No Next.js imports — unit-testable with the fake db.
 */
import { normalizeEmail } from './security';
import { isOfficialAdminEmail } from './services/first-run';

/** Is this email one of the two official administrators? (case-insensitive) */
export function isSuperAdminEmail(email: string): boolean {
  return isOfficialAdminEmail(normalizeEmail(email));
}

/**
 * Is this user a super-admin? False for null/undefined users and for
 * users without an email. Callers that must not trust the session pass
 * the user row re-read from the database (see
 * lib/services/audit-access-service.ts).
 */
export function isSuperAdmin(
  user: { email?: string | null } | null | undefined,
): boolean {
  if (!user || !user.email) return false;
  return isSuperAdminEmail(user.email);
}
