'use client';
import { useState } from 'react';
import Link from 'next/link';
import FadeIn from '@/components/ui/FadeIn';
import type { PublicSuccessStory } from '@/lib/db/types';
import { SUCCESS_STORY_CATEGORIES } from '@/lib/success-story-categories';
import { Trophy, ArrowRight, GraduationCap, MapPin, Quote } from 'lucide-react';
import { visibleCount } from '@/lib/management';

/**
 * Stories grid for /success-stories (PR #32).
 *
 * Featured stories show in full above; the rest start at 5 with a
 * "Load More" button that reveals 5 more per click — client-side, no
 * full-page reload. Story cards are visually distinct from team cards:
 * a compact grid card with a circular photo, quote and "Read the full
 * story" link (team cards are large top photos with name, designation
 * and X/LinkedIn links below).
 */

const INITIAL_VISIBLE = 5;
const LOAD_MORE_STEP = 5;

function categoryLabel(value: string): string {
  return SUCCESS_STORY_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function StoryCard({ story, featured }: { story: PublicSuccessStory; featured?: boolean }) {
  return (
    <Link href={`/success-stories/${story.id}`}>
      <FadeIn className="h-full">
        <article
          className={`group bg-dark-card border rounded-2xl overflow-hidden hover:border-primary/40 transition-all duration-300 h-full flex flex-col ${
            featured ? 'border-primary/50 shadow-[0_0_40px_-12px_rgba(250,204,21,0.35)]' : 'border-dark-border'
          }`}
        >
          <div className="p-6 flex flex-col flex-1">
            <div className="flex items-start gap-4 mb-4">
              {story.profilePictureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={story.profilePictureUrl}
                  alt={story.fullName}
                  className="w-16 h-16 rounded-full object-cover border-2 border-primary/40 shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/40 flex items-center justify-center shrink-0">
                  <span className="text-2xl font-black text-primary-text">
                    {story.fullName.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-foreground leading-tight">{story.fullName}</h3>
                {story.designation && <p className="text-sm text-primary-text font-medium truncate">{story.designation}</p>}
                <p className="text-xs text-muted mt-1 flex items-center gap-1">
                  <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {story.courseTitle}
                    {story.batchNumber ? ` · Batch ${story.batchNumber}` : ''}
                  </span>
                </p>
                {story.country && (
                  <p className="text-xs text-muted mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    {story.city ? `${story.city}, ${story.country}` : story.country}
                  </p>
                )}
              </div>
            </div>

            {featured && (
              <span className="inline-flex items-center gap-1 self-start text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-primary/15 text-primary-text border border-primary/30 mb-3">
                <Trophy className="w-3 h-3" /> Featured Story
              </span>
            )}

            <Quote className="w-5 h-5 text-primary-text/50 mb-2" />
            <p className="text-sm text-muted leading-relaxed line-clamp-4 flex-1">{story.story}</p>

            {story.categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4">
                {story.categories.slice(0, 3).map((c) => (
                  <span
                    key={c}
                    className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary-text border border-primary/20"
                  >
                    {categoryLabel(c)}
                  </span>
                ))}
                {story.categories.length > 3 && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-dark-border text-muted">
                    +{story.categories.length - 3} more
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-1 text-sm font-semibold text-primary-text mt-5 group-hover:gap-2 transition-all">
              Read the full story <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </article>
      </FadeIn>
    </Link>
  );
}

export default function StoriesWithLoadMore({
  featured,
  rest,
}: {
  featured: PublicSuccessStory[];
  rest: PublicSuccessStory[];
}) {
  const [loads, setLoads] = useState(0);
  const shown = visibleCount(rest.length, INITIAL_VISIBLE, loads, LOAD_MORE_STEP);
  const visible = rest.slice(0, shown);

  return (
    <>
      {featured.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl font-bold text-foreground mb-5 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary-text" /> Featured Stories
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {featured.map((story) => (
              <StoryCard key={story.id} story={story} featured />
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section>
          {featured.length > 0 && (
            <h2 className="text-xl font-bold text-foreground mb-5">All Stories</h2>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visible.map((story) => (
              <StoryCard key={story.id} story={story} />
            ))}
          </div>
          {shown < rest.length && (
            <div className="text-center mt-10">
              <button
                onClick={() => setLoads((l) => l + 1)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-ink font-bold text-sm hover:opacity-90 transition-opacity shadow-[0_0_30px_-8px_rgba(250,204,21,0.6)]"
              >
                Load More Stories ({rest.length - shown} more)
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
