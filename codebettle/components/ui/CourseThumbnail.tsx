'use client';
import { useState } from 'react';
import { COURSE_THUMBNAIL_FALLBACK } from '@/lib/thumbnail';

interface CourseThumbnailProps {
  src: string;
  alt: string;
  className?: string;
}

/**
 * Course thumbnail <img> with a broken-image fallback. Every render
 * site (public catalogue, course page, admin list, instructor and
 * student portals) uses this instead of a bare <img>, so a dead or
 * mistyped thumbnail URL shows the dark/gold CodeBettle placeholder
 * instead of a broken-image icon. The fallback swap happens at most
 * once, so a failing placeholder cannot loop.
 */
export default function CourseThumbnail({ src, alt, className }: CourseThumbnailProps) {
  const [currentSrc, setCurrentSrc] = useState(src);
  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      onError={() => {
        if (currentSrc !== COURSE_THUMBNAIL_FALLBACK) setCurrentSrc(COURSE_THUMBNAIL_FALLBACK);
      }}
    />
  );
}
