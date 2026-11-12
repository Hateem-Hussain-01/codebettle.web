import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import FadeIn from '@/components/ui/FadeIn';
import { getPostBySlug } from '@/lib/db/blog';
import { getSession } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import { sanitizeBlogHtml } from '@/lib/sanitize';
import { Clock, Tag, FileText, Download } from 'lucide-react';

/** A post's `content` is HTML when it was written in the admin rich-text
 * editor, and plain text for older posts. HTML is sanitized before it is
 * rendered (Phase 7, SEC-08 — see lib/sanitize.ts); keep the old
 * paragraph split for plain-text posts. */
function isHtml(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content);
}

/**
 * Per-post metadata (Phase 7, CB-16 SEO): the post title and excerpt
 * in the tab and in link previews.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return { title: 'Post not found | CodeBettle' };
  return {
    title: `${post.title} | CodeBettle`,
    description: post.excerpt,
    openGraph: {
      title: `${post.title} | CodeBettle`,
      description: post.excerpt,
      images: post.thumbnail ? [{ url: post.thumbnail }] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();
  const session = await getSession();

  return (
    <>
      <Navbar session={session} />
      <main className="min-h-screen bg-background pt-16">
        <div className="h-72 relative overflow-hidden">
          <img src={post.thumbnail} alt={post.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 -mt-16 relative pb-20">
          <FadeIn className="bg-dark-card border border-dark-border rounded-xl p-8">
            <span className="text-xs font-medium text-primary-text">{post.category}</span>
            <h1 className="text-2xl sm:text-3xl font-black text-foreground mt-2 mb-4">{post.title}</h1>
            <div className="flex items-center gap-4 text-xs text-muted mb-8 pb-6 border-b border-dark-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary-text text-xs font-bold">{post.authorName.charAt(0)}</div>
                <span className="text-foreground font-medium">{post.authorName}</span>
              </div>
              <span>{formatDate(post.publishedAt)}</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{post.readTime}</span>
            </div>
            {isHtml(post.content) ? (
              <div
                className="prose prose-invert max-w-none text-muted leading-relaxed [&_h2]:text-foreground [&_h3]:text-foreground [&_a]:text-primary-text [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: sanitizeBlogHtml(post.content) }}
              />
            ) : (
              <div className="prose prose-invert max-w-none">
                {post.content.split('\n\n').map((para, i) => (
                  <p key={i} className="text-muted leading-relaxed mb-4 whitespace-pre-wrap">{para}</p>
                ))}
              </div>
            )}
            {post.pdfUrl && (
              <div className="mt-8 border border-dark-border rounded-xl overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-dark-border/20">
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <FileText className="w-4 h-4 text-primary-text" /> Attached PDF
                  </span>
                  <a
                    href={post.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-ink hover:bg-primary-dark transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> View / download PDF
                  </a>
                </div>
                {/* Theme audit: bg-white is intentional — embedded PDF pages render white. */}
                <iframe
                  src={post.pdfUrl}
                  title={`PDF for ${post.title}`}
                  className="w-full h-[600px] bg-white"
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t border-dark-border">
              <Tag className="w-4 h-4 text-muted" />
              {post.tags.map(tag => <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary-text border border-primary/20">{tag}</span>)}
            </div>
          </FadeIn>
        </div>
      </main>
      <Footer />
    </>
  );
}
