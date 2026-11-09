import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import { getPublishedPosts } from '@/lib/db/blog';
import { getSession } from '@/lib/auth';
import { Clock, ArrowRight } from 'lucide-react';

export default async function BlogPage() {
  const session = await getSession();
  const posts = await getPublishedPosts();

  return (
    <>
      <Navbar session={session} />
      <main className="min-h-screen bg-background pt-16">
        <div className="py-16 bg-dark-card border-b border-dark-border text-center">
          <div className="max-w-xl mx-auto px-4">
            <span className="text-primary text-sm font-semibold uppercase tracking-wider">Blog</span>
            <h1 className="text-4xl font-black text-white mt-2 mb-3">Tech <span className="gradient-text">Insights</span></h1>
            <p className="text-muted">Articles, tutorials, and tips from our expert instructors.</p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map(post => (
              <Link key={post.id} href={`/blog/${post.slug}`}>
                <div className="group bg-dark-card border border-dark-border rounded-xl overflow-hidden hover:border-primary/30 transition-all duration-300 h-full flex flex-col">
                  <div className="h-48 overflow-hidden">
                    <img src={post.thumbnail} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <span className="text-xs font-medium text-primary mb-2">{post.category}</span>
                    <h2 className="text-white font-bold leading-snug mb-2 group-hover:text-primary transition-colors flex-1">{post.title}</h2>
                    <p className="text-muted text-sm line-clamp-2 mb-4">{post.excerpt}</p>
                    <div className="flex items-center justify-between text-xs text-muted">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">{post.authorName.charAt(0)}</div>
                        <span>{post.authorName}</span>
                      </div>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{post.readTime}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
