/**
 * Nav item repository (PR #32 — Navbar Editor). Same fail-safe shape
 * as lib/db/team-members.ts: the table arrives via migration
 * 20261113T1640_success_stories_management; until Eman runs it, reads
 * return empty (the navbar falls back to its hardcoded items) and
 * writes return a clear error.
 */
import { getDb } from './client';
import { mapNavItemRow, stripUndefined } from './mappers';
import type { NavItem, NavItemRow } from './types';
import { DEFAULT_NAV_ITEMS } from '../management';

export function isMissingNavItemTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';
  if (code === '42P01' && text.includes('NavItem')) return true;
  return /relation .* does not exist/i.test(text) && text.includes('NavItem');
}

async function withNavItemTableFallback<T>(fetch: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fetch();
  } catch (error) {
    if (isMissingNavItemTableError(error)) return fallback;
    throw error;
  }
}

export const NAV_ITEM_TABLES_MISSING_MESSAGE =
  'Nav item table is not set up yet — run codebettle-success-stories-mgmt-migration.sql in the Supabase SQL Editor first.';

function throwIfTablesMissing(error: unknown): never {
  if (isMissingNavItemTableError(error)) {
    throw new Error(NAV_ITEM_TABLES_MISSING_MESSAGE);
  }
  throw error;
}

export async function areNavItemTablesReady(): Promise<boolean> {
  try {
    await getDb().orm.public.NavItem.orderBy((n) => n.createdAt.desc()).limit(1).all();
    return true;
  } catch (error) {
    if (isMissingNavItemTableError(error)) return false;
    throw error;
  }
}

export interface CreateNavItemInput {
  label: string;
  href: string;
  order?: number;
  enabled?: boolean;
}

export async function createNavItem(input: CreateNavItemInput): Promise<NavItem> {
  try {
    const row = await getDb().orm.public.NavItem.create({
      label: input.label,
      href: input.href,
      order: input.order ?? 0,
      enabled: input.enabled ?? true,
    });
    return mapNavItemRow(row as NavItemRow);
  } catch (error) {
    throwIfTablesMissing(error);
  }
}

export async function getNavItemById(id: string): Promise<NavItem | null> {
  return withNavItemTableFallback(async () => {
    const row = await getDb().orm.public.NavItem.where({ id }).first();
    return row ? mapNavItemRow(row as NavItemRow) : null;
  }, null);
}

/** Every nav item, display order (admin view). */
export async function listNavItems(): Promise<NavItem[]> {
  return withNavItemTableFallback(async () => {
    const rows = await getDb()
      .orm.public.NavItem.orderBy((n) => n.order.asc())
      .orderBy((n) => n.createdAt.asc())
      .all();
    return rows.map((r) => mapNavItemRow(r as NavItemRow));
  }, []);
}

export interface UpdateNavItemInput {
  label?: string;
  href?: string;
  order?: number;
  enabled?: boolean;
}

export async function updateNavItem(id: string, input: UpdateNavItemInput): Promise<NavItem | null> {
  try {
    const updated = await getDb()
      .orm.public.NavItem.where({ id })
      .update(stripUndefined({ ...input }));
    if (!updated) return null;
    return getNavItemById(id);
  } catch (error) {
    throwIfTablesMissing(error);
  }
}

export async function deleteNavItem(id: string): Promise<boolean> {
  try {
    const deleted = await getDb().orm.public.NavItem.where({ id }).delete();
    return deleted !== null;
  } catch (error) {
    throwIfTablesMissing(error);
  }
}

/**
 * Seed the nav config from the current hardcoded items (with
 * 'Spotlight' for /success-stories) — called once, the first time an
 * admin saves a change in the Navbar Editor while the table is empty.
 * Returns the seeded items. A second call is a no-op (returns the
 * existing items) so a double-click cannot duplicate the nav.
 */
export async function seedDefaultNavItems(): Promise<NavItem[]> {
  const existing = await listNavItems();
  if (existing.length > 0) return existing;
  const created: NavItem[] = [];
  for (let i = 0; i < DEFAULT_NAV_ITEMS.length; i += 1) {
    created.push(
      await createNavItem({ label: DEFAULT_NAV_ITEMS[i].label, href: DEFAULT_NAV_ITEMS[i].href, order: i, enabled: true }),
    );
  }
  return created;
}
