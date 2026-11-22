import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import FadeIn from '@/components/ui/FadeIn';
import PublicPageBackdrop from '@/components/ui/PublicPageBackdrop';
import PageAccentScene from '@/components/ui/PageAccentScene';
import TiltCard from '@/components/ui/TiltCard';
import Link from 'next/link';
import { getPublishedPosts } from '@/lib/db/blog';
import { getSession } from '@/lib/auth';
import { Clock, ArrowRight, FileText, Newspaper } from 'lucide-react';

export default async function BlogPage() {
  const session = await getSession();
  const posts = await getPublishedPosts();
  // The hero's 3D chips show the categories that actually have
  // posts — real data, decorative only (no filtering behaviour).
  const categories = [...new Set(posts.map((post) => post.category))].slice(0, 6);

  return (
    <>
      <Navbar session={session} />
      <main className="min-h-screen bg-background pt-16">
        {/* Hero — the same 3D treatment as the other public pages
            (About / Success Stories, PR #72; Eman, 22 Nov 2026):
            shared backdrop + floating gold orbs + accent scene
            (gold 3D shapes at the hero edge) + 3D-tilted glass
            chips for the post categories. Title, subtext and the
            posts grid below are untouched. */}
        <div className="relative py-16 sm:py-20 bg-dark-card border-b border-dark-border text-center overflow-hidden">
          {/* Shared public-page backdrop: static grid + glows, plus
              a slow gold particle field on desktop/WebGL. */}
          <PublicPageBackdrop variant="hero" />
          {/* Floating gold orbs — pure decoration, slow drift. */}
          <div aria-hidden="true" className="absolute top-10 left-[12%] w-20 h-20 rounded-full bg-primary/10 blur-2xl pointer-events-none animate-float-slow hidden md:block" />
          <div aria-hidden="true" className="absolute bottom-8 right-[10%] w-28 h-28 rounded-full bg-primary/[0.07] blur-2xl pointer-events-none animate-float-slower hidden md:block" />
          {/* Floating gold shapes at the right edge — the same world
              as the Home hero scene, at a whisper. */}
          <PageAccentScene layout="right" />
          <FadeIn className="relative max-w-3xl mx-auto px-4">
            <span className="inline-flex items-center gap-2 text-primary-text text-sm font-semibold uppercase tracking-wider">
              <Newspaper className="w-4 h-4" /> Blog
            </span>
            <h1 className="text-4xl sm:text-5xl font-black text-foreground mt-3 mb-4">Tech <span className="gradient-text">Insights</span></h1>
            <p className="text-muted text-lg leading-relaxed">Articles, tutorials, and tips from our expert instructors.</p>
            {categories.length > 0 && (
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                {categories.map((category) => (
                  <TiltCard key={category} max={6}>
                    <div className="glass-card flex items-center gap-2 px-4 py-2 rounded-full border border-dark-border text-sm font-semibold text-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      {category}
                    </div>
                  </TiltCard>
                ))}
              </div>
            )}
          </FadeIn>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post, i) => (
              <Link key={post.id} href={`/blog/${post.slug}`}>
                <FadeIn delay={Math.min(i % 3, 2) * 0.08} className="h-full">
                <div className="group bg-dark-card border border-dark-border rounded-xl overflow-hidden hover:border-primary/30 transition-all duration-300 h-full flex flex-col">
                  <div className="h-48 overflow-hidden">
                    <img src={post.thumbnail} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-primary-text">{post.category}</span>
                      {post.pdfUrl && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary-text border border-primary/20">
                          <FileText className="w-3 h-3" /> PDF
                        </span>
                      )}
                    </div>
                    <h2 className="text-foreground font-bold leading-snug mb-2 group-hover:text-primary-text transition-colors flex-1">{post.title}</h2>
                    <p className="text-muted text-sm line-clamp-2 mb-4">{post.excerpt}</p>
                    <div className="flex items-center justify-between text-xs text-muted">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary-text text-xs font-bold">{post.authorName.charAt(0)}</div>
                        <span>{post.authorName}</span>
                      </div>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{post.readTime}</span>
                    </div>
                  </div>
                </div>
                </FadeIn>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
