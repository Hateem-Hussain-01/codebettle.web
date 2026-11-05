'use client';
import { Star } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  rating: number;
  maxStars?: number;
  interactive?: boolean;
  onChange?: (rating: number) => void;
  size?: 'sm' | 'md' | 'lg';
}

export default function StarRating({ rating, maxStars = 5, interactive, onChange, size = 'md' }: StarRatingProps) {
  const [hovered, setHovered] = useState(0);
  const sizeMap = { sm: 'w-3 h-3', md: 'w-4 h-4', lg: 'w-5 h-5' };

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: maxStars }, (_, i) => {
        const filled = (hovered || rating) > i;
        return (
          <Star
            key={i}
            className={cn(
              sizeMap[size],
              'transition-colors',
              filled ? 'text-primary fill-primary' : 'text-muted',
              interactive && 'cursor-pointer hover:scale-110'
            )}
            onMouseEnter={() => interactive && setHovered(i + 1)}
            onMouseLeave={() => interactive && setHovered(0)}
            onClick={() => interactive && onChange?.(i + 1)}
          />
        );
      })}
    </div>
  );
}
