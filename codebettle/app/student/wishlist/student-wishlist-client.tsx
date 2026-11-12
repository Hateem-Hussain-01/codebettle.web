'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Heart, Trash2, Plus } from 'lucide-react';
import CourseCard from '@/components/ui/CourseCard';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import FadeIn from '@/components/ui/FadeIn';
import type { PublicCourse } from '@/lib/db/types';
import toast from 'react-hot-toast';

interface WishlistEntry {
  id: string;
  courseId: string;
}

interface StudentWishlistClientProps {
  initialItems: WishlistEntry[];
  courses: PublicCourse[];
  instructorNames: Record<string, string>;
}

/**
 * Student wishlist — backed by /api/student/wishlist (Phase 0d).
 * Renders the server-provided entries first, then re-syncs from the
 * API on mount so add/remove from course cards shows up here too.
 * Removing an entry deletes it through the API (own entries only).
 */
export default function StudentWishlistClient({ initialItems, courses: initialCourses, instructorNames }: StudentWishlistClientProps) {
  const [items, setItems] = useState<WishlistEntry[]>(initialItems);
  const [courses, setCourses] = useState<PublicCourse[]>(initialCourses);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/student/wishlist');
        if (!res.ok) return;
        const data = (await res.json()) as {
          wishlist: { id: string; courseId: string; course: PublicCourse | null }[];
        };
        setItems(data.wishlist.map((w) => ({ id: w.id, courseId: w.courseId })));
        setCourses(data.wishlist.map((w) => w.course).filter((c): c is PublicCourse => c !== null));
      } catch {
        // Keep the server-rendered entries; the API sync is best-effort.
      }
    })();
  }, []);

  const wishlisted = courses.filter((c) => items.some((w) => w.courseId === c.id));

  const removeFromWishlist = async (courseId: string) => {
    const entry = items.find((w) => w.courseId === courseId);
    if (!entry) return;
    try {
      const res = await fetch(`/api/student/wishlist/${entry.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove from wishlist');
      setItems((w) => w.filter((i) => i.id !== entry.id));
      setCourses((c) => c.filter((course) => course.id !== courseId));
      toast.success('Removed from wishlist');
    } catch {
      toast.error('Could not remove from wishlist');
    }
  };

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-foreground">My Wishlist</h1>
        <p className="text-muted text-sm mt-1">{wishlisted.length} saved course{wishlisted.length !== 1 ? 's' : ''}</p>
      </FadeIn>

      {wishlisted.length === 0 ? (
        <Card className="py-16 text-center">
          <Heart className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-foreground font-semibold mb-2">Your wishlist is empty</p>
          <p className="text-muted text-sm mb-4">Start adding courses you are interested in.</p>
          <Link href="/courses">
            <Button size="sm"><Plus className="w-4 h-4" />Add to Wishlist</Button>
          </Link>
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
