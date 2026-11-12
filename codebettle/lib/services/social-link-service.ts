/**
 * Footer social-link management service (Phase 4, Module 7).
 *
 * The logic behind /api/admin/social-links/*. No Next.js imports —
 * unit-testable with the fake db. Every mutation writes an audit entry.
 *
 * Authorisation is enforced here as well as in the route guard
 * (requireAdminArea('settings')): only admins hold the
 * `manageSettings` capability (lib/rbac.ts), so a non-admin can never
 * create, edit or delete a footer icon even if a route guard were
 * bypassed. Footer icons are public profile URLs, not secrets — but
 * writes are admin-only all the same, because they change what every
 * visitor sees.
 *
 * URL rule (shared with the route schemas via lib/social.ts
 * isValidSocialUrl): http(s) profile URLs and mailto: addresses only.
 */
import {
  createSocialLink,
  deleteSocialLink,
  getSocialLinkById,
  listSocialLinks,
  updateSocialLink,
  type CreateSocialLinkInput,
  type UpdateSocialLinkInput,
} from '../db/social-links';
import { logAudit } from '../db/audit';
import { can } from '../rbac';
import { isValidSocialUrl } from '../social';
import type { SocialLink } from '../db/types';
import { badRequest, forbidden, notFound, type Actor, type ServiceError } from './errors';

type Result<T> = T | ServiceError;

function requireManage(actor: Actor): ServiceError | null {
  if (!can(actor.role, 'manageSettings')) {
    return forbidden('Only admins can manage footer social icons');
  }
  return null;
}

export async function listSocialLinksService(
  actor: Actor,
): Promise<Result<{ links: SocialLink[] }>> {
  const err = requireManage(actor);
  if (err) return err;
  return { links: await listSocialLinks() };
}

export async function createSocialLinkService(
  actor: Actor,
  input: CreateSocialLinkInput,
): Promise<Result<{ link: SocialLink }>> {
  const err = requireManage(actor);
  if (err) return err;
  if (!input.name.trim()) return badRequest('Icon name is required');
  if (!isValidSocialUrl(input.url)) {
    return badRequest('Icon link must be a valid https:// URL or a mailto: address');
  }
  const link = await createSocialLink({
    ...input,
    name: input.name.trim(),
    url: input.url.trim(),
  });
  await logAudit({
    actorId: actor.id,
    action: 'social-link.create',
    entity: 'social-link',
    entityId: link.id,
    detail: link.name,
  });
  return { link };
}

export async function updateSocialLinkService(
  actor: Actor,
  id: string,
  input: UpdateSocialLinkInput,
): Promise<Result<{ link: SocialLink }>> {
  const err = requireManage(actor);
  if (err) return err;
  const existing = await getSocialLinkById(id);
  if (!existing) return notFound('Social link');
  if (input.name !== undefined && !input.name.trim()) {
    return badRequest('Icon name is required');
  }
  if (input.url !== undefined && !isValidSocialUrl(input.url)) {
    return badRequest('Icon link must be a valid https:// URL or a mailto: address');
  }
  const updated = await updateSocialLink(id, {
    ...input,
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.url !== undefined ? { url: input.url.trim() } : {}),
  });
  if (!updated) return notFound('Social link');
  await logAudit({
    actorId: actor.id,
    action: 'social-link.update',
    entity: 'social-link',
    entityId: updated.id,
    detail: updated.name,
  });
  return { link: updated };
}

export async function deleteSocialLinkService(
  actor: Actor,
  id: string,
): Promise<Result<{ success: true }>> {
  const err = requireManage(actor);
  if (err) return err;
  const existing = await getSocialLinkById(id);
  if (!existing) return notFound('Social link');
  await deleteSocialLink(id);
  await logAudit({
    actorId: actor.id,
    action: 'social-link.delete',
    entity: 'social-link',
    entityId: id,
    detail: existing.name,
  });
  return { success: true };
}
