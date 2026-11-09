/**
 * Blog repository (Phase 2, Prisma-backed).
 * Same function names as the old lib/data/blog.ts.
 */
import { getDb } from './client';
import { mapBlogPostRow } from './mappers';
import type { BlogPost } from './types';

export async function getPublishedPosts(): Promise<BlogPost[]> {
  const rows = await getDb()
    .orm.public.BlogPost.where((b) => b.isPublished.eq(true))
    .orderBy((b) => b.publishedAt.desc())
    .all();
  return rows.map(mapBlogPostRow);
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const row = await getDb().orm.public.BlogPost.where({ slug }).first();
  if (!row) return null;
  return mapBlogPostRow(row);
}

export async function listBlogPosts(): Promise<BlogPost[]> {
  const rows = await getDb()
    .orm.public.BlogPost.orderBy((b) => b.createdAt.desc())
    .all();
  return rows.map(mapBlogPostRow);
}
