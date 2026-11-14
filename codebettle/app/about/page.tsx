import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import FadeIn from '@/components/ui/FadeIn';
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
        <div className="py-20 bg-dark-card border-b border-dark-border text-center">
          <FadeIn className="max-w-3xl mx-auto px-4">
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
              <FadeIn key={item.title} delay={i * 0.08} className="bg-dark-card border border-dark-border rounded-xl p-6 text-center hover:border-primary/30 transition-all">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary-text mb-4">{item.icon}</div>
                <h3 className="text-foreground font-bold text-lg mb-3">{item.title}</h3>
                <p className="text-muted text-sm leading-relaxed">{item.desc}</p>
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
