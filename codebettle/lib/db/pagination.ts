/**
 * Pagination helpers (Phase 2). Pure functions — unit-tested.
 *
 * List endpoints and admin lists use server-side pagination (25 per page
 * by default, max 100). Every list API returns a Page<T> so the UI can
 * render page controls from real totals instead of guessing.
 */

export interface PageParams {
  page: number;
  limit: number;
  offset: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** Parse and clamp raw query params (?page=2&limit=50). Never throws. */
export function parsePageParams(
  raw: { page?: string | string[] | undefined; limit?: string | string[] | undefined },
): PageParams {
  const pageNum = Number(Array.isArray(raw.page) ? raw.page[0] : raw.page);
  const limitNum = Number(Array.isArray(raw.limit) ? raw.limit[0] : raw.limit);
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? Math.floor(pageNum) : 1;
  const limit =
    Number.isFinite(limitNum) && limitNum >= 1
      ? Math.min(Math.floor(limitNum), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  return { page, limit, offset: (page - 1) * limit };
}

/** Build a Page<T> from fetched items + a total count. */
export function toPage<T>(items: T[], total: number, params: PageParams): Page<T> {
  const totalPages = Math.max(1, Math.ceil(total / params.limit));
  return {
    items,
    page: params.page,
    limit: params.limit,
    total,
    totalPages,
    hasNext: params.page < totalPages,
    hasPrev: params.page > 1,
  };
}
