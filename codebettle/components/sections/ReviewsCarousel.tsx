'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Globe, Quote, X } from 'lucide-react';
import { GithubIcon, LinkedInIcon } from '@/components/auth/BrandIcons';
import StarRating from '@/components/ui/StarRating';
import type { StudentReview } from '@/lib/db/types';

/**
 * Home page "What Our Students Say" carousel (PR #32).
 *
 * - Auto-moves left-to-right on a timer (one card exits left, the next
 *   enters from the right); PAUSES on hover so a card can be clicked,
 *   resumes on mouse leave. Prev/next arrows too.
 * - 3 cards visible on desktop, 2 on tablet, 1 on mobile.
 * - Click a card -> modal with the full review (photo, name, role,
 *   stars, social links when present, prev/next arrows, "n / total").
 * - No reviews -> the section is hidden (honest empty state: the admin
 *   adds real reviews from Admin > Reviews; no fake reviews are seeded).
 */

function visibleCountForWidth(width: number): number {
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

function ReviewPhoto({ review, size }: { review: StudentReview; size: 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'w-24 h-24' : 'w-12 h-12';
  if (review.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={review.photoUrl} alt={review.fullName} className={`${cls} rounded-full object-cover border-2 border-primary/40 shrink-0`} />;
  }
  return (
    <div className={`${cls} rounded-full bg-primary/10 border-2 border-primary/40 flex items-center justify-center shrink-0`}>
      <span className={`${size === 'lg' ? 'text-3xl' : 'text-lg'} font-black text-primary-text`}>
        {review.fullName.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

function SocialLinks({ review }: { review: StudentReview }) {
  const links: { href: string; label: string; icon: React.ReactNode }[] = [];
  if (review.linkedinUrl) links.push({ href: review.linkedinUrl, label: 'LinkedIn', icon: <LinkedInIcon className="w-4 h-4" /> });
  if (review.githubUrl) links.push({ href: review.githubUrl, label: 'GitHub', icon: <GithubIcon className="w-4 h-4" /> });
  if (review.websiteUrl) links.push({ href: review.websiteUrl, label: 'Website', icon: <Globe className="w-4 h-4" /> });
  if (links.length === 0) return null;
  return (
    <div className="flex items-center gap-2 mt-3">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.label}
          className="w-8 h-8 rounded-full border border-dark-border bg-background flex items-center justify-center text-muted hover:text-primary-text hover:border-primary/40 transition-colors"
        >
          {link.icon}
        </a>
      ))}
    </div>
  );
}

export default function ReviewsCarousel({ reviews }: { reviews: StudentReview[] }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(3);
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const update = () => setVisible(visibleCountForWidth(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const maxIndex = Math.max(0, reviews.length - visible);
  const safeIndex = Math.min(index, maxIndex);

  const next = useCallback(() => {
    setIndex((i) => (i >= maxIndex ? 0 : i + 1));
  }, [maxIndex]);
  const prev = useCallback(() => {
    setIndex((i) => (i <= 0 ? maxIndex : i - 1));
  }, [maxIndex]);

  useEffect(() => {
    if (paused || reviews.length <= visible) return;
    timerRef.current = setInterval(next, 4000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [paused, next, reviews.length, visible]);

  // Escape closes the modal; arrow keys move between reviews in it.
  useEffect(() => {
    if (selected === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
      if (e.key === 'ArrowRight') setSelected((s) => (s === null ? s : (s + 1) % reviews.length));
      if (e.key === 'ArrowLeft') setSelected((s) => (s === null ? s : (s - 1 + reviews.length) % reviews.length));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, reviews.length]);

  if (reviews.length === 0) return null;

  const selectedReview = selected !== null ? reviews[selected] : null;

  return (
    <section className="py-24 bg-background" aria-label="Student reviews">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4 mb-12">
          <div>
            <span className="text-primary-text text-sm font-semibold uppercase tracking-wider">Student Reviews</span>
            <h2 className="text-3xl sm:text-4xl font-black text-foreground mt-2">
              What Our <span className="gradient-text">Students Say</span>
            </h2>
            <p className="text-muted mt-3 max-w-xl">Real feedback from our learners who are building better futures with CodeBettle.</p>
          </div>
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <button
              onClick={prev}
              aria-label="Previous reviews"
              className="w-10 h-10 rounded-full border border-dark-border bg-dark-card flex items-center justify-center text-muted hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={next}
              aria-label="Next reviews"
              className="w-10 h-10 rounded-full border border-dark-border bg-dark-card flex items-center justify-center text-muted hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div
          className="overflow-hidden"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div
            className="flex transition-transform duration-700 ease-in-out"
            style={{ transform: `translateX(-${safeIndex * (100 / visible)}%)` }}
          >
            {reviews.map((review, i) => (
              <article
                key={review.id}
                className="shrink-0 px-3"
                style={{ width: `${100 / visible}%` }}
              >
                <button
                  onClick={() => setSelected(i)}
                  className="w-full text-left bg-dark-card border border-dark-border rounded-2xl overflow-hidden hover:border-primary/40 transition-all duration-300 group"
                  aria-label={`Read ${review.fullName}'s full review`}
                >
                  <div className="relative">
                    {review.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={review.photoUrl} alt={review.fullName} className="w-full aspect-[4/3] object-cover" />
                    ) : (
                      <div className="w-full aspect-[4/3] bg-primary/10 flex items-center justify-center">
                        <span className="text-6xl font-black text-primary-text">{review.fullName.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <span className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur flex items-center justify-center text-foreground group-hover:bg-primary group-hover:text-ink transition-colors">
                      <ArrowUpRight className="w-4 h-4" />
                    </span>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 to-transparent px-4 pt-8 pb-3">
                      <StarRating rating={review.rating} size="sm" />
                      <p className="text-foreground font-bold leading-tight mt-1">{review.fullName}</p>
                      <p className="text-xs text-muted">{review.role}</p>
                    </div>
                  </div>
                  <div className="p-4">
                    <Quote className="w-4 h-4 text-primary-text/50 mb-1" />
                    <p className="text-sm text-muted leading-relaxed line-clamp-3">“{review.reviewText}”</p>
                  </div>
                </button>
              </article>
            ))}
          </div>
        </div>

        {reviews.length > visible && (
          <div className="flex items-center justify-center gap-2 mt-8">
            {Array.from({ length: maxIndex + 1 }, (_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Go to review page ${i + 1}`}
                className={`h-2 rounded-full transition-all ${i === safeIndex ? 'w-8 bg-primary' : 'w-2 bg-dark-border hover:bg-muted'}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Review modal */}
      {selectedReview && selected !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedReview.fullName}'s review`}
        >
          <div
            className="relative w-full max-w-2xl bg-dark-card border border-primary/30 rounded-2xl p-6 sm:p-8 shadow-[0_0_60px_-12px_rgba(250,204,21,0.4)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelected(null)}
              aria-label="Close review"
              className="absolute top-4 right-4 w-8 h-8 rounded-full border border-dark-border flex items-center justify-center text-muted hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="flex flex-col items-center sm:items-start text-center sm:text-left shrink-0">
                <ReviewPhoto review={selectedReview} size="lg" />
                <div className="mt-3">
                  <StarRating rating={selectedReview.rating} size="md" />
                </div>
                <p className="text-foreground font-bold text-lg mt-2">{selectedReview.fullName}</p>
                <p className="text-sm text-muted">{selectedReview.role}</p>
                <SocialLinks review={selectedReview} />
              </div>
              <div className="min-w-0 flex-1">
                <Quote className="w-8 h-8 text-primary-text/50 mb-3" />
                <p className="text-foreground/90 leading-relaxed">{selectedReview.reviewText}</p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-4 mt-8">
              <button
                onClick={() => setSelected((selected - 1 + reviews.length) % reviews.length)}
                aria-label="Previous review"
                className="w-10 h-10 rounded-full border border-dark-border flex items-center justify-center text-muted hover:text-foreground hover:border-primary/40 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-muted font-medium">
                {selected + 1} / {reviews.length}
              </span>
              <button
                onClick={() => setSelected((selected + 1) % reviews.length)}
                aria-label="Next review"
                className="w-10 h-10 rounded-full border border-dark-border flex items-center justify-center text-muted hover:text-foreground hover:border-primary/40 transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
