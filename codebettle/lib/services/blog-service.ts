/**
 * Blog management service (Phase 3).
 *
 * The logic behind /api/admin/blog*. Admins may touch any post; an
 * instructor may create posts and edit ONLY their own. No Next.js imports
 * — unit-testable with the fake db. Every mutation writes an audit entry.
 */
import { createBlogPost, deleteBlogPost, getBlogPostById, getPostBySlug, updateBlogPost } from '../db/blog';
import { sanitizeBlogHtml } from '../sanitize';
import { logAudit } from '../db/audit';
import { BLOG_PDF_BUCKET, deleteBlogPdf } from './blog-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BlogPost } from '../db/types';
import { badRequest, forbidden, notFound, type Actor, type ServiceError } from './errors';
import { hasAdminCapability, hasTeacherCapability } from '../rbac';

type Result<T> = T | ServiceError;

function isAuthorOrAdmin(actor: Actor, post: BlogPost): ServiceError | null {
  // Phase 2: admin flag / teacher flag (legacy role fallback).
  if (hasAdminCapability(actor)) return null;
  if (hasTeacherCapability(actor) && post.authorId === actor.id) return null;
  return forbidden(
    hasTeacherCapability(actor)
      ? 'You can only edit your own blog posts'
      : 'Only admins and instructors can manage blog posts',
  );
}

export interface CreateBlogPostServiceInput {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  pdfUrl?: string;
  thumbnail: string;
  category: string;
  authorName?: string;
  publishedAt?: string;
  isPublished?: boolean;
  readTime: string;
  tags?: string[];
}

export async function createBlogPostService(
  actor: Actor,
  input: CreateBlogPostServiceInput,
): Promise<Result<{ post: BlogPost }>> {
  if (!hasAdminCapability(actor) && !hasTeacherCapability(actor)) {
    return forbidden('Only admins and instructors can write blog posts');
  }
  const slug = input.slug.trim();
  if (!slug) return badRequest('Slug is required');
  if (!input.title.trim()) return badRequest('Title is required');
  if (!input.content.trim() && !(input.pdfUrl ?? '').trim()) {
    return badRequest('Content or a PDF is required');
  }
  const authorName = input.authorName?.trim() || actor.name?.trim() || '';
  if (!authorName) return badRequest('Author name is required');
  if (await getPostBySlug(slug)) return badRequest('A blog post with this slug already exists');
  const isPublished = input.isPublished ?? false;
  const publishedAt = isPublished ? (input.publishedAt ?? new Date().toISOString().slice(0, 10)) : (input.publishedAt ?? null);
  // Sanitize on save (SEC-08): the editor stores raw HTML and the public
  // page renders it with dangerouslySetInnerHTML — pasted script tags,
  // event handlers and iframes must never reach the database.
  const post = await createBlogPost({
    slug,
    title: input.title,
    excerpt: input.excerpt,
    content: sanitizeBlogHtml(input.content),
    pdfUrl: input.pdfUrl,
    thumbnail: input.thumbnail,
    category: input.category,
    authorId: actor.id,
    authorName,
    publishedAt,
    isPublished,
    readTime: input.readTime,
    tags: input.tags,
  });
  await logAudit({ actorId: actor.id, action: 'blog.create', entity: 'blog', entityId: post.id, detail: slug });
  return { post };
}

export interface UpdateBlogPostServiceInput {
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

export async function updateBlogPostService(
  actor: Actor,
  postId: string,
  input: UpdateBlogPostServiceInput,
): Promise<Result<{ post: BlogPost }>> {
  const post = await getBlogPostById(postId);
  if (!post) return notFound('Blog post');
  const denied = isAuthorOrAdmin(actor, post);
  if (denied) return denied;
  if (input.slug !== undefined) {
    const slug = input.slug.trim();
    if (!slug) return badRequest('Slug is required');
    const clash = await getPostBySlug(slug);
    if (clash && clash.id !== postId) return badRequest('A blog post with this slug already exists');
  }
  if (input.title !== undefined && !input.title.trim()) return badRequest('Title is required');
  // Publishing a post that has never had a publish date stamps today.
  let publishedAt = input.publishedAt;
  if (input.isPublished === true && publishedAt === undefined && !post.publishedAt) {
    publishedAt = new Date().toISOString().slice(0, 10);
  }
  const updated = await updateBlogPost(postId, {
    ...input,
    ...(input.content !== undefined ? { content: sanitizeBlogHtml(input.content) } : {}),
    publishedAt,
  });
  if (!updated) return notFound('Blog post');
  await logAudit({ actorId: actor.id, action: 'blog.update', entity: 'blog', entityId: postId });
  return { post: updated };
}

export async function deleteBlogPostService(
  actor: Actor,
  postId: string,
  storageClient?: SupabaseClient,
): Promise<Result<{ success: true }>> {
  const post = await getBlogPostById(postId);
  if (!post) return notFound('Blog post');
  const denied = isAuthorOrAdmin(actor, post);
  if (denied) return denied;
  // Remove the stored PDF first, when the post still points at the
  // blog-pdfs bucket. A storage failure must NOT block the row delete:
  // the post is gone either way, and a leftover file is harmless.
  const storagePath = blogPdfStoragePath(post.pdfUrl);
  if (storagePath) {
    try {
      await deleteBlogPdf(storagePath, storageClient);
    } catch (e) {
      console.error(`Blog PDF cleanup failed for post ${postId} (${storagePath}):`, e);
    }
  }
  const removed = await deleteBlogPost(postId);
  if (!removed) return notFound('Blog post');
  await logAudit({ actorId: actor.id, action: 'blog.delete', entity: 'blog', entityId: postId, detail: post.slug });
  return { success: true };
}

/**
 * Derive the Supabase Storage path of a blog post's PDF from its stored
 * URL, e.g. `https://<ref>.supabase.co/storage/v1/object/public/blog-pdfs/blogs/<uuid>.pdf`
 * → `blogs/<uuid>.pdf`. Returns null when there is no pdfUrl, or when it
 * does not point at the `blog-pdfs` bucket (external PDF links and bare
 * paths are left alone — the delete simply skips storage cleanup).
 */
export function blogPdfStoragePath(pdfUrl: string | null | undefined): string | null {
  if (!pdfUrl) return null;
  const marker = `/${BLOG_PDF_BUCKET}/`;
  const at = pdfUrl.indexOf(marker);
  if (at === -1) return null;
  const path = pdfUrl.slice(at + marker.length).split(/[?#]/, 1)[0];
  return path ? path : null;
}
