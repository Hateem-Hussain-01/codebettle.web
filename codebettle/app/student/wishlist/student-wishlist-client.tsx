'use client';
import { useState } from 'react';
import { Heart, Trash2 } from 'lucide-react';
import CourseCard from '@/components/ui/CourseCard';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';
import type { PublicCourse } from '@/lib/db/types';
import toast from 'react-hot-toast';

const INITIAL_WISHLIST = ['course-3', 'course-5'];

interface StudentWishlistClientProps {
  courses: PublicCourse[];
  instructorNames: Record<string, string>;
}

export default function StudentWishlistClient({ courses, instructorNames }: StudentWishlistClientProps) {
  const [wishlist, setWishlist] = useState<string[]>(INITIAL_WISHLIST);

  const wishlisted = courses.filter(c => wishlist.includes(c.id));

  const removeFromWishlist = (id: string) => {
    setWishlist(w => w.filter(i => i !== id));
    toast.success('Removed from wishlist');
  };

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-white">My Wishlist</h1>
        <p className="text-muted text-sm mt-1">{wishlisted.length} saved course{wishlisted.length !== 1 ? 's' : ''}</p>
      </FadeIn>

      {wishlisted.length === 0 ? (
        <Card className="py-16 text-center">
          <Heart className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-white font-semibold mb-2">Your wishlist is empty</p>
          <p className="text-muted text-sm">Save courses you're interested in to access them later.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {wishlisted.map((course, i) => {
            const instructorName = instructorNames[course.instructorId] || 'Instructor';
            return (
              <div key={course.id} className="relative">
                <CourseCard course={course} instructorName={instructorName} index={i} isWishlisted={true} onWishlist={removeFromWishlist} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
