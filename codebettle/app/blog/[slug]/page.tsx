import { notFound } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { getPostBySlug } from '@/lib/data/blog';
import { getSession } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import { Clock, Tag } from 'lucide-react';

export default async function BlogPostPage({ params }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
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
          <div className="bg-dark-card border border-dark-border rounded-xl p-8">
            <span className="text-xs font-medium text-primary">{post.category}</span>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-2 mb-4">{post.title}</h1>
            <div className="flex items-center gap-4 text-xs text-muted mb-8 pb-6 border-b border-dark-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">{post.authorName.charAt(0)}</div>
                <span className="text-white font-medium">{post.authorName}</span>
              </div>
              <span>{formatDate(post.publishedAt)}</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{post.readTime}</span>
            </div>
            <div className="prose prose-invert max-w-none">
              {post.content.split('\n\n').map((para, i) => (
                <p key={i} className="text-muted leading-relaxed mb-4 whitespace-pre-wrap">{para}</p>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t border-dark-border">
              <Tag className="w-4 h-4 text-muted" />
              {post.tags.map(tag => <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">{tag}</span>)}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
