import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import FadeIn from '@/components/ui/FadeIn';
import PublicPageBackdrop from '@/components/ui/PublicPageBackdrop';
import TiltCard from '@/components/ui/TiltCard';
import TeamSection from '@/components/sections/TeamSection';
import { getSession } from '@/lib/auth';
import { listEnabledTeamMembers } from '@/lib/db/team-members';
import { Target, Eye, Heart } from 'lucide-react';

export default async function AboutPage() {
  const session = await getSession();
  // Admin-managed team (PR #32, moved here from /success-stories by
  // Eman's 13 Nov 2026 change; flat by his 14 Nov 2026 change):
  // enabled members only, ONE flat list in the admin-set display
  // order (sortOrder) — no department/hierarchy grouping. Empty
  // until the migration has run / an admin adds members — the
  // section shows its honest empty state instead of breaking.
  const teamMembers = await listEnabledTeamMembers();

  return (
    <>
      <Navbar session={session} />
      <main className="min-h-screen bg-background pt-16">
        {/* Hero */}
        <div className="relative py-20 bg-dark-card border-b border-dark-border text-center overflow-hidden">
          {/* Shared public-page backdrop (Step 2): static grid + glows,
              plus a slow gold particle field on desktop/WebGL. */}
          <PublicPageBackdrop variant="hero" />
          {/* Floating gold orbs — pure decoration, slow drift. */}
          <div aria-hidden="true" className="absolute top-10 left-[12%] w-20 h-20 rounded-full bg-primary/10 blur-2xl pointer-events-none animate-float-slow hidden md:block" />
          <div aria-hidden="true" className="absolute bottom-8 right-[10%] w-28 h-28 rounded-full bg-primary/[0.07] blur-2xl pointer-events-none animate-float-slower hidden md:block" />
          <FadeIn className="relative max-w-3xl mx-auto px-4">
            <span className="text-primary-text text-sm font-semibold uppercase tracking-wider">About Us</span>
            <h1 className="text-4xl sm:text-5xl font-black text-foreground mt-2 mb-4">
              Empowering <span className="gradient-text">Pakistan's</span> Tech Future
            </h1>
            <p className="text-muted text-lg leading-relaxed">
              CodeBettle is Pakistan's premier digital institute, founded with a mission to make world-class technology education accessible to every aspiring developer and designer.
            </p>
          </FadeIn>
        </div>

        {/* Mission/Vision/Values */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
            {[
              { icon: <Target className="w-8 h-8" />, title: 'Our Mission', desc: 'To provide affordable, high-quality tech education that empowers individuals to build successful careers in the digital economy.' },
              { icon: <Eye className="w-8 h-8" />, title: 'Our Vision', desc: 'A Pakistan where every talented individual has access to the skills and knowledge needed to compete in the global tech industry.' },
              { icon: <Heart className="w-8 h-8" />, title: 'Our Values', desc: 'Excellence in education, accessibility for all, community-driven growth, and a commitment to real-world, practical learning.' },
            ].map((item, i) => (
              <FadeIn key={item.title} delay={i * 0.08} className="h-full">
                <TiltCard max={6} className="h-full">
                  <div className="bg-dark-card border border-dark-border rounded-xl p-6 text-center hover:border-primary/30 hover:-translate-y-1 hover:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)] transition-all h-full">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary-text mb-4 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]">{item.icon}</div>
                    <h3 className="text-foreground font-bold text-lg mb-3">{item.title}</h3>
                    <p className="text-muted text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </TiltCard>
              </FadeIn>
            ))}
          </div>

          {/* Team — admin-managed (Admin > Success Stories Management) */}
          <FadeIn className="text-center mb-12">
            <span className="text-primary-text text-sm font-semibold uppercase tracking-wider">Meet Our Team</span>
            <h2 className="text-3xl font-black text-foreground mt-2">Meet the Team Behind <span className="gradient-text">CodeBettle</span></h2>
          </FadeIn>
          <TeamSection members={teamMembers} />
        </div>
      </main>
      <Footer />
    </>
  );
}
