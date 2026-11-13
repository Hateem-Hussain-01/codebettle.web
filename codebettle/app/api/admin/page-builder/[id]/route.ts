import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import {
  deletePage,
  getPageById,
  isPageTableMissing,
  updatePage,
  type UpdatePageInput,
  PageTableMissingError,
} from '@/lib/db/pages';
import {
  isPageStatus,
  MAX_PAGE_BLOCKS,
  MAX_PAGE_TITLE_LENGTH,
  normalizeSlug,
  PAGE_BLOCK_TYPES,
  validateSlug,
  type PageBlock,
} from '@/lib/page-builder';

/**
 * GET /api/admin/page-builder/[id] — one page (for the editor).
 * PATCH — update title / slug / status / blocks. Body fields are all
 * optional; `blocks` must be an array (each item's type must be a
 * known block type — unknown blocks are dropped by the repository's
 * sanitiser). A taken slug is a 409; an unknown id is a 404.
 * DELETE — real delete: the row is removed from the database.
 *
 * Guard: requireAdminArea('page-builder').
 */
const blockSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(PAGE_BLOCK_TYPES),
  layout: z.object({
    width: z.number(),
    height: z.number().optional(),
  }),
  content: z.record(z.string(), z.unknown()),
});

const updateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(MAX_PAGE_TITLE_LENGTH).optional(),
  slug: z.string().trim().min(1, 'URL is required').optional(),
  status: z.enum(['draft', 'published']).optional(),
  blocks: z.array(blockSchema).max(MAX_PAGE_BLOCKS).optional(),
});

function isUniqueSlugError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (code === '23505') return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && /Page_slug_key|duplicate key.*slug/i.test(message);
}

function tableMissingResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Page Builder tables are not set up yet — run codebettle-page-builder-migration.sql in the Supabase SQL Editor first.' },
    { status: 503 },
  );
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('page-builder');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  try {
    const page = await getPageById(id);
    if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    return NextResponse.json({ page, tableMissing: false });
  } catch (error) {
    if (isPageTableMissing(error)) {
      return NextResponse.json({ page: null, tableMissing: true });
    }
    throw error;
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('page-builder');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid page' },
      { status: 400 },
    );
  }
  const input: UpdatePageInput = {};
  if (parsed.data.title !== undefined) input.title = parsed.data.title;
  if (parsed.data.status !== undefined) {
    if (!isPageStatus(parsed.data.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    input.status = parsed.data.status;
  }
  if (parsed.data.slug !== undefined) {
    const slug = normalizeSlug(parsed.data.slug);
    const slugError = validateSlug(slug);
    if (slugError) return NextResponse.json({ error: slugError }, { status: 400 });
    input.slug = slug;
  }
  // The repository re-sanitises blocks (unknown types dropped, layouts
  // clamped, text HTML sanitised), so the zod shape is cast at the
  // boundary and never trusted downstream.
  if (parsed.data.blocks !== undefined) {
    input.blocks = parsed.data.blocks as unknown as PageBlock[];
  }
  try {
    const page = await updatePage(id, input);
    if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    return NextResponse.json({ page });
  } catch (error) {
    if (error instanceof PageTableMissingError || isPageTableMissing(error)) {
      return tableMissingResponse();
    }
    if (isUniqueSlugError(error)) {
      return NextResponse.json({ error: 'This URL is already used by another page' }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('page-builder');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  try {
    const deleted = await deletePage(id);
    if (!deleted) return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof PageTableMissingError || isPageTableMissing(error)) {
      return tableMissingResponse();
    }
    throw error;
  }
}
