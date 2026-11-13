/**
 * Page repository (Admin > Page Builder).
 *
 * Fail-safe by design (same shape as lib/db/email-templates.ts): when
 * the Page table has not been created yet (the SQL migration has not
 * run), every read/write throws a PageTableMissingError instead of
 * crashing the caller with a raw Postgres error. API routes catch it
 * with isPageTableMissing() and the builder UI shows a "run the SQL"
 * state; the public /pages/[slug] route treats a missing table as
 * "page not found". Nothing else on the site touches this table, so the
 * rest of the app is unaffected.
 */
import { getDb } from './client';
import { mapPageRow } from './mappers';
import type { Page } from './types';
import { parsePageBlocks, sanitizePageBlocks, type PageBlock } from '../page-builder';

export const PAGE_TABLE_MISSING = 'PAGE_TABLE_MISSING';

/** Thrown when the Page table does not exist yet. */
export class PageTableMissingError extends Error {
  readonly code = PAGE_TABLE_MISSING;
  constructor() {
    super('Page table does not exist yet — run the page-builder SQL migration');
    this.name = 'PageTableMissingError';
  }
}

/**
 * True when the error is a missing Page table (Postgres 42P01
 * undefined_table, or the relation name in the message).
 */
export function isPageTableMissing(error: unknown): boolean {
  if (error instanceof PageTableMissingError) return true;
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';
  if (code === '42P01' && text.includes('Page')) return true;
  return /relation .*Page.* does not exist/i.test(text);
}

function toMissingTable<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    if (isPageTableMissing(error)) throw new PageTableMissingError();
    throw error;
  });
}

/** Cheap probe: true when the table exists (migration has run). */
export async function arePageTablesReady(): Promise<boolean> {
  try {
    await getDb().orm.public.Page.orderBy((p) => p.createdAt.desc()).limit(1).all();
    return true;
  } catch (error) {
    if (isPageTableMissing(error)) return false;
    throw error;
  }
}

export async function listPages(): Promise<Page[]> {
  return toMissingTable(async () => {
    const rows = await getDb().orm.public.Page.orderBy((p) => p.createdAt.desc()).all();
    return rows.map((r) => mapPageRow(r));
  });
}

/** Published pages only — the ones the sitemap / public index may list. */
export async function listPublishedPages(): Promise<Page[]> {
  const all = await listPages();
  return all.filter((p) => p.status === 'published');
}

export async function getPageById(id: string): Promise<Page | null> {
  return toMissingTable(async () => {
    const row = await getDb().orm.public.Page.where({ id }).first();
    if (!row) return null;
    return mapPageRow(row);
  });
}

export async function getPageBySlug(slug: string): Promise<Page | null> {
  return toMissingTable(async () => {
    const row = await getDb().orm.public.Page.where({ slug }).first();
    if (!row) return null;
    return mapPageRow(row);
  });
}

/**
 * The public lookup: a published page by slug, or null. Drafts are
 * never returned here — the public route treats them as not found.
 * A missing table also yields null (fail-safe: 404, not a crash).
 */
export async function getPublishedPageBySlug(slug: string): Promise<Page | null> {
  try {
    const page = await getPageBySlug(slug);
    if (!page || page.status !== 'published') return null;
    return page;
  } catch (error) {
    if (isPageTableMissing(error)) return null;
    throw error;
  }
}

export interface CreatePageInput {
  title: string;
  slug: string;
  status?: 'draft' | 'published';
  blocks?: PageBlock[];
}

export async function createPage(input: CreatePageInput): Promise<Page> {
  return toMissingTable(async () => {
    const blocks = sanitizePageBlocks(input.blocks ?? []);
    const row = await getDb().orm.public.Page.create({
      title: input.title,
      slug: input.slug,
      status: input.status ?? 'draft',
      blocks: JSON.parse(JSON.stringify(blocks)),
    });
    return mapPageRow(row);
  });
}

export interface UpdatePageInput {
  title?: string;
  slug?: string;
  status?: 'draft' | 'published';
  blocks?: PageBlock[];
}

export async function updatePage(id: string, input: UpdatePageInput): Promise<Page | null> {
  return toMissingTable(async () => {
    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.status !== undefined) data.status = input.status;
    if (input.blocks !== undefined) {
      const blocks = sanitizePageBlocks(input.blocks);
      data.blocks = JSON.parse(JSON.stringify(blocks));
    }
    const row = await getDb().orm.public.Page.where({ id }).update(data);
    if (!row) return null;
    return getPageById(id);
  });
}

/** Real delete: the row is removed from the database (not hidden). */
export async function deletePage(id: string): Promise<boolean> {
  return toMissingTable(async () => {
    const row = await getDb().orm.public.Page.where({ id }).delete();
    return row !== null;
  });
}

/** Re-parse stored blocks (used by the public renderer as a guard). */
export function parseStoredBlocks(value: unknown): PageBlock[] {
  return parsePageBlocks(value);
}
