import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
import { getPublishedPosts } from '@/lib/db/blog';
import { motion } from 'framer-motion';

export default async function BlogPreview() {
  const posts = (await getPublishedPosts()).slice(0, 3);

  return (
    <section className="py-24 bg-dark-card border-y border-dark-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-12">
          <div>
            <span className="text-primary-text text-sm font-semibold uppercase tracking-wider">From Our Blog</span>
            <h2 className="text-3xl sm:text-4xl font-black text-foreground mt-2">
              Latest <span className="gradient-text">Articles</span>
            </h2>
          </div>
          <Link href="/blog" className="hidden sm:flex items-center gap-2 text-primary-text text-sm font-medium">
            View All <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {posts.map((post, i) => (
            <Link key={post.id} href={`/blog/${post.slug}`}>
              <div className="group bg-surface border border-dark-border rounded-xl overflow-hidden hover:border-primary/30 transition-all duration-300">
                <div className="h-44 overflow-hidden">
                  <img src={post.thumbnail} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-5">
                  <span className="text-xs font-medium text-primary-text">{post.category}</span>
                  <h3 className="text-sm font-semibold text-foreground mt-1.5 mb-2 line-clamp-2 group-hover:text-primary-text transition-colors">{post.title}</h3>
                  <p className="text-xs text-muted line-clamp-2 mb-3">{post.excerpt}</p>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>{post.authorName}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{post.readTime}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
