'use client';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Star, Users, BookOpen, Heart } from 'lucide-react';
import Badge from './Badge';
import CourseThumbnail from './CourseThumbnail';
import { formatPrice, getLevelColor, getCategoryColor } from '@/lib/utils';
import type { PublicCourse } from '@/lib/db/types';

interface CourseCardProps {
  course: PublicCourse;
  instructorName: string;
  isWishlisted?: boolean;
  onWishlist?: (id: string) => void;
  index?: number;
  /**
   * Show the price in the card footer. Default true. The home-page
   * featured-courses section passes false — the fee is revealed only
   * on the course detail page, not on the home page.
   */
  showPrice?: boolean;
}

export default function CourseCard({ course, instructorName, isWishlisted, onWishlist, index = 0, showPrice = true }: CourseCardProps) {
  const totalLessons = course.modules.reduce((acc, m) => acc + m.lessons.length, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      className="group"
    >
      <Link href={`/courses/${course.slug}`}>
        <div className="card-lift bg-dark-card border border-dark-border rounded-xl overflow-hidden hover:border-primary/40 hover:shadow-[0_0_20px_rgba(245,197,24,0.1)] h-full flex flex-col">
          {/* Thumbnail */}
          <div className="relative h-44 overflow-hidden bg-dark-border flex-shrink-0">
            <CourseThumbnail
              src={course.thumbnail}
              alt={course.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            {/* Module 6: photo overlays stay dark in BOTH themes — the
                thumbnail is a photo, not a theme surface. bg-black and
                from-black keep the wishlist heart and the level pill
                readable in light mode too. */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            {course.isFeatured && (
              <span className="absolute top-3 left-3 text-xs font-bold px-2.5 py-1 bg-primary text-ink rounded-full">Featured</span>
            )}
            {onWishlist && (
              <button
                onClick={(e) => { e.preventDefault(); onWishlist(course.id); }}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black transition-colors cursor-pointer"
              >
                <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-primary text-primary' : 'text-white'}`} />
              </button>
            )}
            <div className="absolute bottom-3 left-3">
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${getLevelColor(course.level)}`}>
                {course.level.charAt(0).toUpperCase() + course.level.slice(1)}
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 flex flex-col flex-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full self-start mb-2 ${getCategoryColor(course.category)}`}>
              {course.category}
            </span>
            <h3 className="text-sm font-semibold text-foreground leading-snug mb-2 line-clamp-2 group-hover:text-primary-text transition-colors">
              {course.title}
            </h3>
            <p className="text-xs text-muted mb-3 line-clamp-2 flex-1">{course.description}</p>

            <p className="text-xs text-muted mb-3">By <span className="text-primary-text">{instructorName}</span></p>

            {/* Meta */}
            <div className="flex items-center gap-3 text-xs text-muted mb-4">
              <span className="flex items-center gap-1"><Star className="w-3 h-3 text-primary-text fill-primary-text" />{course.rating}</span>
              <span className="flex items-center gap-1"><Users className="w-3 h-3" />{course.enrolledCount.toLocaleString()}</span>
              <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{totalLessons} lessons</span>
            </div>

            {/* Price (hidden when showPrice is false — the home page
                hides the fee; the detail page is where it is revealed).
                Without the price the Enroll button stays right-aligned. */}
            <div className={`flex items-center ${showPrice ? 'justify-between' : 'justify-end'} mt-auto pt-3 border-t border-dark-border`}>
              {showPrice && (
                <span className={`text-base font-bold ${course.isFree ? 'text-green-400' : 'text-primary-text'}`}>
                  {formatPrice(course.price)}
                </span>
              )}
              <span className="text-xs px-3 py-1.5 bg-primary/10 text-primary-text rounded-lg font-medium group-hover:bg-primary group-hover:text-ink transition-all">
                Enroll Now →
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
