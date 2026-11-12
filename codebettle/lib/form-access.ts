/**
 * Public-form access helpers (Forms Builder GHL upgrade, Worker B).
 *
 * Pure functions for the two special render modes on /forms/[slug]:
 *
 * - Preview (`?preview=1`): admin-only. An admin sees ANY form (draft
 *   or published) exactly as submitters will see it. A non-admin or
 *   anonymous request with `?preview=1` must 404 exactly like an
 *   unknown slug — the draft's existence is never leaked.
 * - Embed (`?embed=1`): public, published-only, standalone (no
 *   Navbar/Footer/hero). Framing is allowed for this render only —
 *   see shouldAllowFraming in lib/security.ts and the proxy.
 *
 * Kept pure (no next/headers, no DB) so the rules are unit-testable;
 * app/forms/[slug]/page.tsx applies them after resolving the session.
 */

export interface FormAccessSubject {
  /** Admin capability (isAdmin flag or legacy primary role admin) — see lib/rbac.ts. */
  isAdmin?: boolean;
  role?: string;
}

/** Admin capability, mirroring lib/rbac.ts hasAdminCapability (kept local so this module stays dependency-free). */
export function canPreviewForm(subject: FormAccessSubject | null | undefined): boolean {
  if (!subject) return false;
  return subject.isAdmin === true || subject.role === 'admin';
}

/** True when the request asks for the admin preview render. */
export function isPreviewRequest(searchParams: { preview?: string | string[] }): boolean {
  return searchParams.preview === '1';
}

/** True when the request asks for the standalone embed render. */
export function isEmbedRequest(searchParams: { embed?: string | string[] }): boolean {
  return searchParams.embed === '1';
}

/**
 * Which form, if any, may be rendered for this request — decided
 * WITHOUT touching the database, from the request mode + the
 * caller's admin status:
 * - preview + admin: any status (draft or published) may render.
 * - preview + non-admin/anonymous: 404 (never leak a draft).
 * - embed / normal: published only.
 * The caller then fetches accordingly (admin path reads the DB
 * directly; the public path uses the published-only service).
 */
export type FormRenderDecision =
  | { render: 'any-status' }
  | { render: 'published-only' }
  | { render: 'not-found' };

export function decideFormRender(
  searchParams: { preview?: string | string[]; embed?: string | string[] },
  subject: FormAccessSubject | null | undefined,
): FormRenderDecision {
  if (isPreviewRequest(searchParams)) {
    return canPreviewForm(subject) ? { render: 'any-status' } : { render: 'not-found' };
  }
  return { render: 'published-only' };
}
