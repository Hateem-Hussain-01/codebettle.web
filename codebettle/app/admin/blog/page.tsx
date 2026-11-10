import { connection } from 'next/server';
import { listBlogPosts } from '@/lib/db/blog';
import BlogClient from './blog-client';

/**
 * Admin blog — server wrapper (Phase 2).
 * Fetches all blog posts on the server and passes them to the client
 * component, which keeps the local add/toggle/delete state.
 */
export default async function AdminBlogPage() {
  await connection();
  const posts = await listBlogPosts();
  return <BlogClient initialPosts={posts} />;
}
