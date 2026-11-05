'use client';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Star, Users, BookOpen, Heart } from 'lucide-react';
import Badge from './Badge';
import { formatPrice, getLevelColor, getCategoryColor } from '@/lib/utils';
import type { Course } from '@/lib/data/courses';

interface CourseCardProps {
  course: Course;
  instructorName: string;
  isWishlisted?: boolean;
  onWishlist?: (id: string) => void;
  index?: number;
}

export default function CourseCard({ course, instructorName, isWishlisted, onWishlist, index = 0 }: CourseCardProps) {
  const totalLessons = course.modules.reduce((acc, m) => acc + m.lessons.length, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      className="group"
    >
      <Link href={`/courses/${course.slug}`}>
        <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden hover:border-primary/40 transition-all duration-300 hover:shadow-[0_0_20px_rgba(245,197,24,0.1)] h-full flex flex-col">
          {/* Thumbnail */}
          <div className="relative h-44 overflow-hidden bg-dark-border flex-shrink-0">
            <img
              src={course.thumbnail}
              alt={course.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-dark/80 to-transparent" />
            {course.isFeatured && (
              <span className="absolute top-3 left-3 text-xs font-bold px-2.5 py-1 bg-primary text-dark rounded-full">Featured</span>
            )}
            {onWishlist && (
              <button
                onClick={(e) => { e.preventDefault(); onWishlist(course.id); }}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-dark/60 backdrop-blur-sm flex items-center justify-center hover:bg-dark transition-colors cursor-pointer"
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
            <h3 className="text-sm font-semibold text-white leading-snug mb-2 line-clamp-2 group-hover:text-primary transition-colors">
              {course.title}
            </h3>
            <p className="text-xs text-muted mb-3 line-clamp-2 flex-1">{course.description}</p>

            <p className="text-xs text-muted mb-3">By <span className="text-primary">{instructorName}</span></p>

            {/* Meta */}
            <div className="flex items-center gap-3 text-xs text-muted mb-4">
              <span className="flex items-center gap-1"><Star className="w-3 h-3 text-primary fill-primary" />{course.rating}</span>
              <span className="flex items-center gap-1"><Users className="w-3 h-3" />{course.enrolledCount.toLocaleString()}</span>
              <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{totalLessons} lessons</span>
            </div>

            {/* Price */}
            <div className="flex items-center justify-between mt-auto pt-3 border-t border-dark-border">
              <span className={`text-base font-bold ${course.isFree ? 'text-green-400' : 'text-primary'}`}>
                {formatPrice(course.price)}
              </span>
              <span className="text-xs px-3 py-1.5 bg-primary/10 text-primary rounded-lg font-medium group-hover:bg-primary group-hover:text-dark transition-all">
                Enroll Now →
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
