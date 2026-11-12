/**
 * Footer social-link repository (Phase 4, Module 7).
 *
 * Admin-managed footer icons (SocialLink model): one row per icon —
 * Icon Name + Icon Link, an enable flag and a display order. The icon
 * itself is auto-fetched from the name (lib/social.ts), never stored.
 * Only enabled links are shown in the footer, ordered by displayOrder
 * (then oldest first). Deleting a row simply removes that icon from
 * the footer; when no rows remain the footer falls back to the
 * hardcoded defaults in lib/social.ts.
 */
import { getDb } from './client';
import { dateToString, stripUndefined } from './mappers';
import type { SocialLink, SocialLinkRow } from './types';

export function mapSocialLinkRow(row: SocialLinkRow): SocialLink {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    displayOrder: row.displayOrder,
    isEnabled: row.isEnabled,
    createdAt: dateToString(row.createdAt),
    updatedAt: dateToString(row.updatedAt),
  };
}

/** All links (admin), in display order. */
export async function listSocialLinks(): Promise<SocialLink[]> {
  const rows = await getDb()
    .orm.public.SocialLink.orderBy((a) => a.displayOrder.asc())
    .orderBy((a) => a.createdAt.asc())
    .all();
  return rows.map(mapSocialLinkRow);
}

/** Enabled links only (what the footer shows), in display order. */
export async function listEnabledSocialLinks(): Promise<SocialLink[]> {
  const rows = await getDb()
    .orm.public.SocialLink.where({ isEnabled: true })
    .orderBy((a) => a.displayOrder.asc())
    .orderBy((a) => a.createdAt.asc())
    .all();
  return rows.map(mapSocialLinkRow);
}

export async function getSocialLinkById(id: string): Promise<SocialLink | null> {
  const row = await getDb().orm.public.SocialLink.where({ id }).first();
  if (!row) return null;
  return mapSocialLinkRow(row);
}

export interface CreateSocialLinkInput {
  name: string;
  url: string;
  displayOrder?: number;
  isEnabled?: boolean;
}

export async function createSocialLink(input: CreateSocialLinkInput): Promise<SocialLink> {
  const row = await getDb().orm.public.SocialLink.create({
    name: input.name,
    url: input.url,
    displayOrder: input.displayOrder ?? 0,
    isEnabled: input.isEnabled ?? true,
  });
  return mapSocialLinkRow(row);
}

export interface UpdateSocialLinkInput {
  name?: string;
  url?: string;
  displayOrder?: number;
  isEnabled?: boolean;
}

/** Update a link. Null when not found. */
export async function updateSocialLink(
  id: string,
  input: UpdateSocialLinkInput,
): Promise<SocialLink | null> {
  const row = await getDb()
    .orm.public.SocialLink.where({ id })
    .update(stripUndefined({ ...input }));
  if (!row) return null;
  return getSocialLinkById(id);
}

/** (De)activate a link. Null when not found. */
export async function setSocialLinkEnabled(
  id: string,
  isEnabled: boolean,
): Promise<SocialLink | null> {
  return updateSocialLink(id, { isEnabled });
}

/** Delete a link. False when not found. */
export async function deleteSocialLink(id: string): Promise<boolean> {
  const row = await getDb().orm.public.SocialLink.where({ id }).delete();
  return row !== null;
}
