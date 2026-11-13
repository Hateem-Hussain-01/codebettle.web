import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { PageBlocks } from '@/components/page-builder/PageBlocks';
import { getSession } from '@/lib/auth';
import { getPublishedPageBySlug } from '@/lib/db/pages';
import { isValidSlug } from '@/lib/page-builder';

/**
 * Public custom page — /pages/<slug> (PR #34, Page Builder).
 *
 * force-dynamic: the page reads the database, so it must be generated
 * per request, not prerendered at build time (there is no database at
 * build time). Server-rendered, no extra client JS beyond what the
 * site already loads (Navbar/Footer). Draft pages and unknown slugs
 * return 404 — a draft is never publicly accessible.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isValidSlug(slug)) return { title: 'Page Not Found | CodeBettle' };
  const page = await getPublishedPageBySlug(slug);
  if (!page) return { title: 'Page Not Found | CodeBettle' };
  return {
    title: `${page.title} | CodeBettle`,
    description: `CodeBettle — ${page.title}.`,
  };
}

export default async function PublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const page = await getPublishedPageBySlug(slug);
  if (!page) notFound();
  const session = await getSession();

  return (
    <>
      <Navbar session={session} />
      <main className="min-h-screen bg-background pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <PageBlocks blocks={page.blocks} />
          {page.blocks.length === 0 && (
            <p className="text-muted text-center py-20">This page has no content yet.</p>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
