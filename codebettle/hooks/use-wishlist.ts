'use client';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';

/**
 * Shared wishlist state for the public course surfaces (Phase 0d).
 *
 * Loads the signed-in student's wishlist once. Signed-out visitors get
 * `signedIn: false` and the caller hides the heart button entirely
 * (CourseCard only renders it when `onWishlist` is passed) — no
 * sign-in prompt is shown on public pages. `toggle` adds/removes
 * through the API and keeps the local set in sync.
 */
export function useWishlist() {
  const [wishlistedIds, setWishlistedIds] = useState<Set<string>>(new Set());
  const [signedIn, setSignedIn] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/student/wishlist');
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) {
          setSignedIn(false);
        } else if (res.ok) {
          const data = (await res.json()) as { wishlist: { courseId: string }[] };
          setWishlistedIds(new Set(data.wishlist.map((w) => w.courseId)));
          setSignedIn(true);
        }
      } catch {
        // Wishlist unavailable — hearts stay hidden, browsing still works.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(
    async (courseId: string) => {
      if (!signedIn) {
        toast.error('Sign in to save courses to your wishlist');
        return;
      }
      const isWishlisted = wishlistedIds.has(courseId);
      try {
        const res = await fetch(
          isWishlisted ? `/api/student/wishlist/${courseId}` : '/api/student/wishlist',
          isWishlisted
            ? { method: 'DELETE' }
            : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId }) },
        );
        if (!res.ok) {
          toast.error(isWishlisted ? 'Could not remove from wishlist' : 'Could not add to wishlist');
          return;
        }
        setWishlistedIds((prev) => {
          const next = new Set(prev);
          if (isWishlisted) next.delete(courseId);
          else next.add(courseId);
          return next;
        });
        toast.success(isWishlisted ? 'Removed from wishlist' : 'Added to wishlist');
      } catch {
        toast.error('Could not update wishlist');
      }
    },
    [signedIn, wishlistedIds],
  );

  return { wishlistedIds, signedIn, loaded, toggle };
}
