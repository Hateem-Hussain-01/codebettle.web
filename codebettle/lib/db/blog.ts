/**
 * Blog repository — write operations (Phase 3).
 * Reads (getPublishedPosts, getPostBySlug, listBlogPosts) already exist.
 * Blog posts have no deletedAt column, so delete is a HARD delete.
 */
import { getDb } from './client';
import { mapBlogPostRow, stringToDate, stripUndefined } from './mappers';
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

export async function getBlogPostById(id: string): Promise<BlogPost | null> {
  const row = await getDb().orm.public.BlogPost.where({ id }).first();
  if (!row) return null;
  return mapBlogPostRow(row);
}

export interface CreateBlogPostInput {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  pdfUrl?: string;
  thumbnail: string;
  category: string;
  authorId: string;
  authorName: string;
  /** 'YYYY-MM-DD'. Null when the post is an unpublished draft. */
  publishedAt?: string | null;
  isPublished: boolean;
  readTime: string;
  tags?: string[];
}

export async function createBlogPost(input: CreateBlogPostInput): Promise<BlogPost> {
  const row = await getDb().orm.public.BlogPost.create({
    slug: input.slug,
    title: input.title,
    excerpt: input.excerpt,
    content: input.content,
    pdfUrl: input.pdfUrl ?? null,
    thumbnail: input.thumbnail,
    category: input.category,
    authorId: input.authorId,
    authorName: input.authorName,
    publishedAt: stringToDate(input.publishedAt),
    isPublished: input.isPublished,
    readTime: input.readTime,
    tags: input.tags ?? [],
  });
  return mapBlogPostRow(row);
}

export interface UpdateBlogPostInput {
  slug?: string;
  title?: string;
  excerpt?: string;
  content?: string;
  pdfUrl?: string | null;
  thumbnail?: string;
  category?: string;
  authorName?: string;
  publishedAt?: string | null;
  isPublished?: boolean;
  readTime?: string;
  tags?: string[];
}

export async function updateBlogPost(id: string, input: UpdateBlogPostInput): Promise<BlogPost | null> {
  const data: Record<string, unknown> = {};
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.title !== undefined) data.title = input.title;
  if (input.excerpt !== undefined) data.excerpt = input.excerpt;
  if (input.content !== undefined) data.content = input.content;
  if (input.pdfUrl !== undefined) data.pdfUrl = input.pdfUrl;
  if (input.thumbnail !== undefined) data.thumbnail = input.thumbnail;
  if (input.category !== undefined) data.category = input.category;
  if (input.authorName !== undefined) data.authorName = input.authorName;
  if (input.publishedAt !== undefined) data.publishedAt = stringToDate(input.publishedAt);
  if (input.isPublished !== undefined) data.isPublished = input.isPublished;
  if (input.readTime !== undefined) data.readTime = input.readTime;
  if (input.tags !== undefined) data.tags = input.tags;
  const row = await getDb()
    .orm.public.BlogPost.where({ id })
    .update(stripUndefined(data));
  if (!row) return null;
  return getBlogPostById(id);
}

/** Hard delete — there is no deletedAt column on BlogPost. Returns false when the post does not exist. */
export async function deleteBlogPost(id: string): Promise<boolean> {
  const row = await getDb().orm.public.BlogPost.where({ id }).delete();
  return row !== null;
}
