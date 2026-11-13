import Link from 'next/link';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import FadeIn from '@/components/ui/FadeIn';
import StoriesWithLoadMore from './stories-client';
import { getSession } from '@/lib/auth';
import { listPublicSuccessStories } from '@/lib/services/success-story-service';
import { listEnabledTeamMembers } from '@/lib/db/team-members';
import { getSiteSettings } from '@/lib/services/settings-service';
import { sanitizeEmailHtml } from '@/lib/sanitize';
import {
  PAGE_STAT_LABELS,
  groupTeamByLevel,
  parsePageStats,
  parseVideoConfig,
  videoAspectClass,
} from '@/lib/management';
import { GithubIcon, LinkedInIcon } from '@/components/auth/BrandIcons';
import { Trophy, Sparkles, Video, Eye, User, Users, Star, ThumbsUp, Clock3, Globe } from 'lucide-react';

export const metadata = {
  title: 'Success Stories | CodeBettle',
  description: 'Real stories from CodeBettle students — jobs, internships, hackathons and businesses built after learning with us.',
};

// CEO photo URL — NOT hardcoded here: it lives in the settings
// (DEFAULT_SETTINGS.ceoPhotoUrl in lib/services/settings-service.ts,
// Ahmad Hassan's photo uploaded 13 Nov 2026) and is read below from
// getSiteSettings(), so an admin-uploaded photo shows with no deploy.

// ---------------------------------------------------------------------------
// PLACEHOLDER TEXTS (RICH TEXT) — shown while no custom text is saved in
// Admin > Settings > Success Stories. Generic wording only: no specific
// claims, numbers, or quotes attributed to Ahmad Hassan. Replace by
// saving the real CEO message / vision in Settings — no code deploy
// needed. Rendered through the same sanitizer as saved values.
// ---------------------------------------------------------------------------
const CEO_MESSAGE_PLACEHOLDER =
  '<p>At CodeBettle, we believe every student has the potential to build a <strong>meaningful career in technology</strong>. Our mission is to give learners practical skills, honest guidance, and a community that supports them at every step of the journey.</p>' +
  '<p>Your success stories inspire us — and the next generation of students — to keep learning, building, and growing together.</p>';
const VISION_TEXT_PLACEHOLDER =
  '<p>Our vision is a Pakistan where any student — from any city, background, or starting point — can learn modern technology skills and turn them into <strong>real opportunities</strong>.</p>' +
  '<p>We want CodeBettle graduates to build careers, businesses, and products they are proud of, and to lift others up as they grow.</p>';

// Shared rich-text styles for the rendered CEO message / vision (same
// element styles the RichTextEditor itself uses, theme tokens only).
const RICH_TEXT_CLASS =
  'text-base text-foreground/90 leading-relaxed space-y-3 ' +
  '[&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground ' +
  '[&_h3]:text-base [&_h3]:font-bold [&_h3]:text-foreground ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ' +
  '[&_a]:text-primary-text [&_a]:underline [&_img]:max-w-full [&_img]:h-auto';

// Portrait video — managed from Admin > Success Stories Management
// (videoUrl setting). No video uploaded yet = placeholder shown.

export default async function SuccessStoriesPage() {
  const session = await getSession();
  const stories = await listPublicSuccessStories();
  // CEO message + vision come from Admin > Settings > Success Stories.
  // Empty setting = show the in-code placeholder. getSiteSettings()
  // never throws (defaults on any DB error), and this page is dynamic
  // (server-rendered per request), so a saved change shows immediately
  // with no code deploy.
  const settings = await getSiteSettings();
  // Rich text from Settings; rendered as HTML ONLY through the
  // sanitizer (same one the email builder uses) — stored HTML is never
  // rendered raw.
  const ceoMessageHtml = sanitizeEmailHtml(
    settings.ceoMessage.trim() ? settings.ceoMessage : CEO_MESSAGE_PLACEHOLDER,
  );
  const visionTextHtml = sanitizeEmailHtml(
    settings.visionText.trim() ? settings.visionText : VISION_TEXT_PLACEHOLDER,
  );
  // CEO photo from settings (default = Ahmad Hassan's uploaded photo;
  // the settings read already falls back to it when nothing is stored).
  const ceoPhotoUrl = settings.ceoPhotoUrl;
  // Video + vision layout from Admin > Success Stories Management
  // (invalid stored values fall back to the current side-by-side
  // portrait behaviour — the public page never breaks on bad config).
  const videoConfig = parseVideoConfig(settings);
  // Team (enabled members only, grouped by hierarchy level) and the
  // four stat cards (admin-editable, Eman's numbers as defaults).
  // Both are empty/honest until an admin adds team members.
  const teamGroups = groupTeamByLevel(await listEnabledTeamMembers());
  const stats = parsePageStats({
    happyStudents: settings.statsHappyStudents,
    averageRating: settings.statsAverageRating,
    recommendRate: settings.statsRecommendRate,
    hoursOfLearning: settings.statsHoursOfLearning,
  });
  const featured = stories.filter((s) => s.featured);
  const rest = stories.filter((s) => !s.featured);

  return (
    <>
      <Navbar session={session} />
      <main className="min-h-screen bg-background pt-16">
        <div className="py-16 bg-dark-card border-b border-dark-border text-center">
          <FadeIn className="max-w-2xl mx-auto px-4">
            <span className="inline-flex items-center gap-2 text-primary-text text-sm font-semibold uppercase tracking-wider">
              <Sparkles className="w-4 h-4" /> Student Success
            </span>
            <h1 className="text-4xl md:text-5xl font-black text-foreground mt-3 mb-3">
              Success <span className="gradient-text">Stories</span>
            </h1>
            <p className="text-muted max-w-xl mx-auto">
              Real journeys from CodeBettle students — the jobs they landed, the businesses they
              started, and the skills that changed their lives.
            </p>
            <div className="mt-8">
              <Link
                href="/success-stories/submit"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-ink font-bold text-sm hover:opacity-90 transition-opacity shadow-[0_0_30px_-8px_rgba(250,204,21,0.6)]"
              >
                <Trophy className="w-4 h-4" /> Submit Your Success Story
              </Link>
            </div>
          </FadeIn>
        </div>

        {/* 1. CEO's Message — photo + message (message from Settings, placeholder fallback) */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12">
          <div className="rounded-2xl border border-dark-border bg-dark-card p-6 sm:p-8 flex flex-col sm:flex-row gap-6 sm:gap-8 items-start">
            {ceoPhotoUrl ? (
              <img
                src={ceoPhotoUrl}
                alt="Ahmad Hassan, CEO of CodeBettle"
                className="w-36 h-44 sm:w-44 sm:h-56 object-cover rounded-xl border border-dark-border shrink-0"
              />
            ) : (
              <div className="w-36 h-44 sm:w-44 sm:h-56 rounded-xl border border-dashed border-dark-border bg-background shrink-0 flex flex-col items-center justify-center gap-2 text-center px-3">
                <User className="w-10 h-10 text-muted" />
                <p className="text-xs text-muted font-medium">CEO photo — coming soon</p>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-[0.2em] text-primary-text uppercase">A Message From Our CEO</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mt-2">Ahmad Hassan</h2>
              <p className="text-sm text-muted">Chief Executive Officer, CodeBettle</p>
              <div className={`${RICH_TEXT_CLASS} mt-4`} dangerouslySetInnerHTML={{ __html: ceoMessageHtml }} />
            </div>
          </div>
        </section>

        {/* 2. Video + Vision — layout from Admin > Success Stories
            Management (side-by-side vs vertical, position swap,
            portrait 9:16 vs landscape 16:9). Video placeholder until
            the admin uploads a video. */}
        <section
          className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 gap-8 items-start ${
            videoConfig.layout === 'vertical' ? 'flex flex-col' : 'grid md:grid-cols-2'
          }`}
        >
          <div
            className={
              videoConfig.layout === 'vertical'
                ? videoConfig.position === 'video-below'
                  ? 'order-2'
                  : 'order-1'
                : videoConfig.position === 'video-right'
                  ? 'md:order-2'
                  : ''
            }
          >
            <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2 mb-4">
              <Video className="w-5 h-5 text-primary-text" /> Watch
            </h2>
            <div
              className={`rounded-2xl overflow-hidden border border-dark-border bg-black ${videoAspectClass(videoConfig.orientation)} ${
                videoConfig.orientation === 'portrait' ? 'max-w-[360px] mx-auto md:mx-0 w-full' : 'w-full'
              }`}
            >
              {videoConfig.videoUrl ? (
                <video src={videoConfig.videoUrl} controls preload="metadata" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-center px-6">
                  <Video className="w-12 h-12 text-muted" />
                  <p className="text-sm text-muted font-medium">Video — coming soon</p>
                  <p className="text-xs text-muted/70">(Placeholder: the video will play here once shared.)</p>
                </div>
              )}
            </div>
          </div>
          <div
            className={
              videoConfig.layout === 'vertical'
                ? videoConfig.position === 'video-below'
                  ? 'order-1'
                  : 'order-2'
                : videoConfig.position === 'video-right'
                  ? 'md:order-1'
                  : ''
            }
          >
            <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2 mb-4">
              <Eye className="w-5 h-5 text-primary-text" /> Our Vision
            </h2>
            <div className={RICH_TEXT_CLASS} dangerouslySetInnerHTML={{ __html: visionTextHtml }} />
          </div>
        </section>

        {/* 3. Team — enabled members only, grouped by hierarchy level
            (top first, several cards per level). Card design follows
            the reference: photo, full name, designation, X + LinkedIn
            links. No team members yet = honest empty state. */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14">
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-2 text-primary-text text-sm font-semibold uppercase tracking-wider">
              <Users className="w-4 h-4" /> Our Team
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-foreground mt-3">
              Meet the Team Behind <span className="gradient-text">CodeBettle</span>
            </h2>
          </div>
          {teamGroups.length === 0 ? (
            <p className="text-center text-muted max-w-md mx-auto">
              Meet the team behind CodeBettle — profiles coming soon.
            </p>
          ) : (
            teamGroups.map((group) => (
              <div key={group.level} className="mb-10 last:mb-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {group.members.map((member) => (
                    <article
                      key={member.id}
                      className="bg-dark-card border border-dark-border rounded-2xl overflow-hidden hover:border-primary/40 transition-all duration-300"
                    >
                      {member.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={member.photoUrl} alt={member.fullName} className="w-full aspect-[4/3] object-cover" />
                      ) : (
                        <div className="w-full aspect-[4/3] bg-primary/10 flex items-center justify-center">
                          <span className="text-6xl font-black text-primary-text">{member.fullName.charAt(0).toUpperCase()}</span>
                        </div>
                      )}
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="text-lg font-bold text-foreground leading-tight">{member.fullName}</h3>
                            <p className="text-sm text-primary-text font-medium">{member.designation}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 pt-1">
                            {member.xUrl && (
                              <a href={member.xUrl} target="_blank" rel="noopener noreferrer" aria-label={`${member.fullName} on X`} className="text-muted hover:text-foreground font-black text-sm leading-none">X</a>
                            )}
                            {member.linkedinUrl && (
                              <a href={member.linkedinUrl} target="_blank" rel="noopener noreferrer" aria-label={`${member.fullName} on LinkedIn`} className="text-muted hover:text-foreground">
                                <LinkedInIcon className="w-4 h-4" />
                              </a>
                            )}
                            {member.githubUrl && (
                              <a href={member.githubUrl} target="_blank" rel="noopener noreferrer" aria-label={`${member.fullName} on GitHub`} className="text-muted hover:text-foreground">
                                <GithubIcon className="w-4 h-4" />
                              </a>
                            )}
                            {member.websiteUrl && (
                              <a href={member.websiteUrl} target="_blank" rel="noopener noreferrer" aria-label={`${member.fullName}'s website`} className="text-muted hover:text-foreground">
                                <Globe className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </div>
                        {member.bio && <p className="text-sm text-muted leading-relaxed mt-3 line-clamp-3">{member.bio}</p>}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>

        {/* 4. Stats — small cards (same numbers as the home page stats,
            admin-editable from the management tab). */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12">
          <div className="rounded-2xl border border-dark-border bg-dark-card px-4 py-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
            {([
              { icon: <Users className="w-5 h-5 text-primary-text" />, value: stats.happyStudents, label: PAGE_STAT_LABELS.happyStudents },
              { icon: <Star className="w-5 h-5 text-primary-text" />, value: stats.averageRating, label: PAGE_STAT_LABELS.averageRating },
              { icon: <ThumbsUp className="w-5 h-5 text-primary-text" />, value: stats.recommendRate, label: PAGE_STAT_LABELS.recommendRate },
              { icon: <Clock3 className="w-5 h-5 text-primary-text" />, value: stats.hoursOfLearning, label: PAGE_STAT_LABELS.hoursOfLearning },
            ] as const).map((stat) => (
              <div key={stat.label} className="flex items-center gap-3 justify-center text-center sm:text-left">
                <span className="shrink-0">{stat.icon}</span>
                <span>
                  <span className="block text-xl font-black text-foreground leading-tight">{stat.value}</span>
                  <span className="block text-xs text-muted">{stat.label}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {stories.length === 0 ? (
            <FadeIn className="text-center py-16">
              <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 border border-primary/25 flex items-center justify-center mb-6">
                <Trophy className="w-9 h-9 text-primary-text" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">No success stories published yet</h2>
              <p className="text-muted max-w-md mx-auto mb-8">
                Our students are writing their stories right now. Be the first to share yours —
                your journey could inspire the next student to start.
              </p>
              <Link
                href="/success-stories/submit"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-ink font-bold text-sm hover:opacity-90 transition-opacity"
              >
                <Trophy className="w-4 h-4" /> Submit Your Success Story
              </Link>
            </FadeIn>
          ) : (
            <StoriesWithLoadMore featured={featured} rest={rest} />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
