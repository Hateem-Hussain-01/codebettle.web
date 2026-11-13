import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import {
  createPage,
  isPageTableMissing,
  listPages,
  PageTableMissingError,
} from '@/lib/db/pages';
import { MAX_PAGE_TITLE_LENGTH, normalizeSlug, validateSlug } from '@/lib/page-builder';

/**
 * GET /api/admin/page-builder — list pages.
 * Returns { pages, tableMissing }. tableMissing is true when the Page
 * SQL migration has not run yet — the UI shows a "run the SQL" state
 * instead of an error.
 * POST /api/admin/page-builder — create a page. Body: { title, slug }.
 * The slug is normalised (lowercase, dashes) and validated; a taken
 * slug is a 409.
 *
 * Guard: requireAdminArea('page-builder') — restricted admins need
 * the 'page-builder' area granted. Full admins pass.
 */
const createSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(MAX_PAGE_TITLE_LENGTH),
  slug: z.string().trim().min(1, 'URL is required'),
});

function isUniqueSlugError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (code === '23505') return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && /Page_slug_key|duplicate key.*slug/i.test(message);
}

export async function GET() {
  const auth = await requireAdminArea('page-builder');
  if ('error' in auth) return auth.error;
  try {
    const pages = await listPages();
    return NextResponse.json({ pages, tableMissing: false });
  } catch (error) {
    if (isPageTableMissing(error)) {
      return NextResponse.json({ pages: [], tableMissing: true });
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('page-builder');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid page' },
      { status: 400 },
    );
  }
  const slug = normalizeSlug(parsed.data.slug);
  const slugError = validateSlug(slug);
  if (slugError) return NextResponse.json({ error: slugError }, { status: 400 });
  try {
    const page = await createPage({ title: parsed.data.title, slug });
    return NextResponse.json({ page }, { status: 201 });
  } catch (error) {
    if (error instanceof PageTableMissingError || isPageTableMissing(error)) {
      return NextResponse.json(
        { error: 'Page Builder tables are not set up yet — run codebettle-page-builder-migration.sql in the Supabase SQL Editor first.' },
        { status: 503 },
      );
    }
    if (isUniqueSlugError(error)) {
      return NextResponse.json({ error: 'This URL is already used by another page' }, { status: 409 });
    }
    throw error;
  }
}
