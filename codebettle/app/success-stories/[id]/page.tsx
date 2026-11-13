import Link from 'next/link';
import { notFound } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import FadeIn from '@/components/ui/FadeIn';
import { getSession } from '@/lib/auth';
import { getPublicSuccessStory } from '@/lib/services/success-story-service';
import { SUCCESS_STORY_CATEGORIES } from '@/lib/success-story-categories';
import { youtubeVideoId } from '@/lib/success-story-validation';
import { GithubIcon, InstagramIcon, LinkedInIcon } from '@/components/auth/BrandIcons';
import {
  ArrowLeft,
  Trophy,
  GraduationCap,
  MapPin,
  Globe,
  ExternalLink,
  FileText,
  Award,
  Quote,
  Code2,
  Briefcase,
  Sparkles,
  Play,
} from 'lucide-react';

function categoryLabel(value: string): string {
  return SUCCESS_STORY_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

const SOCIAL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  linkedin: LinkedInIcon,
  github: GithubIcon,
  instagram: InstagramIcon,
  youtube: Play,
};

function StorySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-foreground mb-2">{title}</h2>
      <p className="text-muted leading-relaxed whitespace-pre-wrap">{children}</p>
    </section>
  );
}

export default async function SuccessStoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const story = await getPublicSuccessStory(id);
  if (!story) notFound();

  const videoId = story.videoUrl ? youtubeVideoId(story.videoUrl) : null;
  // The public shape carries each profile as its own URL field (there is
  // no socialLinks array, and no email is ever exposed publicly).
  const socialLinks = (
    [
      { platform: 'linkedin', url: story.linkedinUrl },
      { platform: 'github', url: story.githubUrl },
      { platform: 'instagram', url: story.instagramUrl },
      { platform: 'youtube', url: story.youtubeUrl },
      { platform: 'portfolio', url: story.portfolioUrl },
      { platform: 'lablab', url: story.lablabUrl },
      { platform: 'leetcode', url: story.leetcodeUrl },
      { platform: 'hackerrank', url: story.hackerrankUrl },
      { platform: 'other', url: story.otherProfileUrl },
    ] as { platform: string; url?: string }[]
  ).filter((l): l is { platform: string; url: string } => Boolean(l.url));

  return (
    <>
      <Navbar session={session} />
      <main className="min-h-screen bg-background pt-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <FadeIn>
            <Link
              href="/success-stories"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground transition-colors mb-8"
            >
              <ArrowLeft className="w-4 h-4" /> All Success Stories
            </Link>

            <div className="bg-dark-card border border-dark-border rounded-2xl overflow-hidden">
              <div className="p-6 sm:p-10">
                <div className="flex flex-col sm:flex-row sm:items-start gap-6 mb-8">
                  {story.profilePictureUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={story.profilePictureUrl}
                      alt={story.fullName}
                      className="w-24 h-24 rounded-full object-cover border-2 border-primary/50 shrink-0"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-primary/10 border-2 border-primary/50 flex items-center justify-center shrink-0">
                      <span className="text-4xl font-black text-primary-text">
                        {story.fullName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="min-w-0">
                    {story.featured && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-primary/15 text-primary-text border border-primary/30 mb-3">
                        <Trophy className="w-3 h-3" /> Featured Story
                      </span>
                    )}
                    <h1 className="text-3xl sm:text-4xl font-black text-foreground leading-tight">{story.fullName}</h1>
                    {story.designation && (
                      <p className="text-primary-text font-semibold mt-1">{story.designation}</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted mt-3">
                      <span className="inline-flex items-center gap-1.5">
                        <GraduationCap className="w-4 h-4" />
                        {story.courseTitle}
                        {story.batchNumber ? ` · Batch ${story.batchNumber}` : ''}
                      </span>
                      {story.country && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="w-4 h-4" />
                          {story.city ? `${story.city}, ${story.country}` : story.country}
                        </span>
                      )}
                    </div>
                    {story.categories.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-4">
                        {story.categories.map((c) => (
                          <span
                            key={c}
                            className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary-text border border-primary/20"
                          >
                            {categoryLabel(c)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <Quote className="w-8 h-8 text-primary-text/50 mb-4" />
                <p className="text-lg text-foreground leading-relaxed whitespace-pre-wrap mb-10">{story.story}</p>

                {story.beforeJoining && <StorySection title="Before joining CodeBettle">{story.beforeJoining}</StorySection>}
                {story.challenges && <StorySection title="The challenges">{story.challenges}</StorySection>}
                {story.howHelped && <StorySection title="How CodeBettle helped">{story.howHelped}</StorySection>}
                {story.achievementsAfter && (
                  <StorySection title="Achievements after joining">{story.achievementsAfter}</StorySection>
                )}
                {story.biggestAchievement && (
                  <StorySection title="Biggest achievement">{story.biggestAchievement}</StorySection>
                )}
                {story.advice && <StorySection title="Advice for new students">{story.advice}</StorySection>}

                {story.skillsLearned && (
                  <section className="mb-8">
                    <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                      <Code2 className="w-5 h-5 text-primary-text" /> Skills Learned
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {story.skillsLearned.split(',').map((s) => s.trim()).filter(Boolean).map((s) => (
                        <span key={s} className="text-sm px-3 py-1.5 rounded-full bg-dark-border text-foreground border border-dark-border">
                          {s}
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                {story.achievements.length > 0 && (
                  <section className="mb-8">
                    <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                      <Award className="w-5 h-5 text-primary-text" /> Achievements
                    </h2>
                    <div className="space-y-4">
                      {story.achievements.map((a) => (
                        <div key={a.id} className="border border-dark-border rounded-xl p-5">
                          <div className="flex items-start gap-3">
                            <Briefcase className="w-5 h-5 text-primary-text shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <h3 className="font-bold text-foreground">{a.title}</h3>
                              <p className="text-sm text-muted">
                                {categoryLabel(a.category)}
                                {a.organization ? ` · ${a.organization}` : ''}
                                {a.achievedAt ? ` · ${new Date(a.achievedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : ''}
                              </p>
                              {a.description && <p className="text-sm text-muted mt-2 whitespace-pre-wrap">{a.description}</p>}
                              {a.links.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                  {a.links.map((e) => (
                                    <a
                                      key={e.url}
                                      href={e.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full bg-primary/10 text-primary-text border border-primary/20 hover:bg-primary/20 transition-colors"
                                    >
                                      <FileText className="w-3.5 h-3.5" />
                                      {e.label || 'Evidence'} <ExternalLink className="w-3 h-3" />
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {(videoId || story.videoPlaybackUrl) && (
                  <section className="mb-8">
                    <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                      <Play className="w-5 h-5 text-primary-text" /> Video Testimonial
                    </h2>
                    <div className="rounded-xl overflow-hidden border border-dark-border aspect-video bg-black">
                      {videoId ? (
                        <iframe
                          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                          title={`${story.fullName} video testimonial`}
                          className="w-full h-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      ) : (
                        <video src={story.videoPlaybackUrl ?? undefined} controls className="w-full h-full" preload="metadata" />
                      )}
                    </div>
                    {story.videoDescription && <p className="text-sm text-muted mt-3">{story.videoDescription}</p>}
                  </section>
                )}

                {socialLinks.length > 0 && (
                  <section className="mb-2">
                    <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                      <Globe className="w-5 h-5 text-primary-text" /> Connect with {story.fullName.split(' ')[0]}
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {socialLinks.map((l) => {
                        const Icon = SOCIAL_ICONS[l.platform] ?? Globe;
                        return (
                          <a
                            key={l.platform}
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-full border border-dark-border text-foreground hover:border-primary/40 hover:text-primary-text transition-colors"
                          >
                            <Icon className="w-4 h-4" />
                            {l.platform.charAt(0).toUpperCase() + l.platform.slice(1)}
                          </a>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>
            </div>

            <div className="text-center mt-10">
              <p className="text-muted mb-4 flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4 text-primary-text" /> Inspired? Your story could be next.
              </p>
              <Link
                href="/success-stories/submit"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-ink font-bold text-sm hover:opacity-90 transition-opacity"
              >
                <Trophy className="w-4 h-4" /> Submit Your Success Story
              </Link>
            </div>
          </FadeIn>
        </div>
      </main>
      <Footer />
    </>
  );
}
