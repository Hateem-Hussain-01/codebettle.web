import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
import { getPublishedPosts } from '@/lib/db/blog';
import FadeIn from '@/components/ui/FadeIn';
import TiltCard from '@/components/ui/TiltCard';

// NOTE (16 Nov 2026 — home page 500, PR #60 regression): this is an
// async SERVER component, so it must never render framer-motion
// components directly — they are client-only and rendering one here
// throws during SSR, taking the whole landing page down (digest
// 3155688011; the flight stream showed every other home section
// rendering and BlogPreview as the error). The entrance animation
// lives in <FadeIn> (a 'use client' wrapper with the same fade + rise
// + stagger), the pattern FeaturedCourses already uses.

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
            <FadeIn key={post.id} delay={i * 0.1} y={24} className="h-full">
            <Link href={`/blog/${post.slug}`} className="block h-full">
              <TiltCard max={5} className="h-full">
              <div className="group bg-surface border border-dark-border rounded-xl overflow-hidden hover:border-primary/30 hover:-translate-y-1 hover:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)] transition-all duration-300 h-full flex flex-col">
                <div className="h-44 overflow-hidden">
                  <img src={post.thumbnail} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <span className="text-xs font-medium text-primary-text">{post.category}</span>
                  <h3 className="text-sm font-semibold text-foreground mt-1.5 mb-2 line-clamp-2 group-hover:text-primary-text transition-colors">{post.title}</h3>
                  <p className="text-xs text-muted line-clamp-2 mb-3">{post.excerpt}</p>
                  <div className="flex items-center justify-between text-xs text-muted mt-auto">
                    <span>{post.authorName}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{post.readTime}</span>
                  </div>
                </div>
              </div>
              </TiltCard>
            </Link>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
