/**
 * Link repository (Links page). Same fail-safe shape as
 * lib/db/nav-items.ts: the table arrives via migration
 * 20261114T0645_add_links_page, which Eman runs himself in the
 * Supabase SQL Editor. Until it runs, reads return empty (the public
 * page shows its honest empty state) and writes return a clear error.
 */
import { getDb } from './client';
import { mapLinkRow, stripUndefined } from './mappers';
import type { Link, LinkRow } from './types';
import { DEFAULT_LINKS } from '../links';

export function isMissingLinkTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';
  if (code === '42P01' && text.includes('Link')) return true;
  return /relation .* does not exist/i.test(text) && text.includes('Link');
}

async function withLinkTableFallback<T>(fetch: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fetch();
  } catch (error) {
    if (isMissingLinkTableError(error)) return fallback;
    throw error;
  }
}

export const LINK_TABLES_MISSING_MESSAGE =
  'Links table is not set up yet — run codebettle-links-page-migration.sql in the Supabase SQL Editor first.';

function throwIfTablesMissing(error: unknown): never {
  if (isMissingLinkTableError(error)) {
    throw new Error(LINK_TABLES_MISSING_MESSAGE);
  }
  throw error;
}

/** Cheap probe: true when the table exists (migration has run). */
export async function areLinkTablesReady(): Promise<boolean> {
  try {
    await getDb().orm.public.Link.orderBy((l) => l.createdAt.desc()).limit(1).all();
    return true;
  } catch (error) {
    if (isMissingLinkTableError(error)) return false;
    throw error;
  }
}

export interface CreateLinkInput {
  label: string;
  url: string;
  icon?: string;
  order?: number;
  enabled?: boolean;
}

export async function createLink(input: CreateLinkInput): Promise<Link> {
  try {
    const row = await getDb().orm.public.Link.create({
      label: input.label,
      url: input.url,
      icon: input.icon ?? 'link',
      order: input.order ?? 0,
      enabled: input.enabled ?? true,
    });
    return mapLinkRow(row as LinkRow);
  } catch (error) {
    throwIfTablesMissing(error);
  }
}

export async function getLinkById(id: string): Promise<Link | null> {
  return withLinkTableFallback(async () => {
    const row = await getDb().orm.public.Link.where({ id }).first();
    return row ? mapLinkRow(row as LinkRow) : null;
  }, null);
}

/** Every link, display order (admin view). */
export async function listLinks(): Promise<Link[]> {
  return withLinkTableFallback(async () => {
    const rows = await getDb()
      .orm.public.Link.orderBy((l) => l.order.asc())
      .orderBy((l) => l.createdAt.asc())
      .all();
    return rows.map((r) => mapLinkRow(r as LinkRow));
  }, []);
}

/** Public list: enabled links only, display order. */
export async function listEnabledLinks(): Promise<Link[]> {
  const all = await listLinks();
  return all.filter((l) => l.enabled);
}

export interface UpdateLinkInput {
  label?: string;
  url?: string;
  icon?: string;
  order?: number;
  enabled?: boolean;
}

export async function updateLink(id: string, input: UpdateLinkInput): Promise<Link | null> {
  try {
    const updated = await getDb()
      .orm.public.Link.where({ id })
      .update(stripUndefined({ ...input }));
    if (!updated) return null;
    return getLinkById(id);
  } catch (error) {
    throwIfTablesMissing(error);
  }
}

export async function deleteLink(id: string): Promise<boolean> {
  try {
    const deleted = await getDb().orm.public.Link.where({ id }).delete();
    return deleted !== null;
  } catch (error) {
    throwIfTablesMissing(error);
  }
}

/**
 * Seed the 6 default links (lib/links.ts) — called once, the first
 * time an admin opens the Links Page editor while the table is empty.
 * Returns the seeded links. A second call is a no-op (returns the
 * existing links) so a double-click cannot duplicate them. The SQL
 * twin seeds the same 6 rows (fixed ids, ON CONFLICT DO NOTHING), so
 * this is only the backup path when the table exists but is empty.
 */
export async function seedDefaultLinks(): Promise<Link[]> {
  const existing = await listLinks();
  if (existing.length > 0) return existing;
  const created: Link[] = [];
  for (const def of DEFAULT_LINKS) {
    created.push(
      await createLink({ label: def.label, url: def.url, icon: def.icon, order: def.order, enabled: true }),
    );
  }
  return created;
}
