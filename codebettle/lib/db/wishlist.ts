/**
 * Wishlist repository (Phase 0/1, Module 4).
 *
 * Replaces the hardcoded INITIAL_WISHLIST (['course-3', 'course-5'])
 * on the student wishlist pages. One row per (student, course) —
 * the database unique constraint is the backstop, and addToWishlist
 * checks first so a second add returns the existing row instead of
 * creating a duplicate (the check-then-create pattern used by
 * createReview / createEnrollment).
 */
import { getDb } from './client';
import { dateToString } from './mappers';
import type { WishlistItem, WishlistRow } from './types';

export function mapWishlistRow(row: WishlistRow): WishlistItem {
  return {
    id: row.id,
    userId: row.userId,
    courseId: row.courseId,
    createdAt: dateToString(row.createdAt),
  };
}

/** The user's wishlist entries, newest first. */
export async function listWishlistForUser(userId: string): Promise<WishlistItem[]> {
  const rows = await getDb()
    .orm.public.Wishlist.where({ userId })
    .orderBy((w) => w.createdAt.desc())
    .all();
  return rows.map(mapWishlistRow);
}

/** Just the course ids on the user's wishlist (what the pages need). */
export async function listWishlistCourseIdsForUser(userId: string): Promise<string[]> {
  const items = await listWishlistForUser(userId);
  return items.map((w) => w.courseId);
}

export async function isWishlisted(userId: string, courseId: string): Promise<boolean> {
  const row = await getDb().orm.public.Wishlist.where({ userId, courseId }).first();
  return row !== null;
}

export async function getWishlistItem(
  userId: string,
  courseId: string,
): Promise<WishlistItem | null> {
  const row = await getDb().orm.public.Wishlist.where({ userId, courseId }).first();
  if (!row) return null;
  return mapWishlistRow(row);
}

/**
 * Add a course to the user's wishlist. Idempotent: adding the same
 * course twice returns the existing row with `duplicate: true` and
 * creates no second row.
 */
export async function addToWishlist(
  userId: string,
  courseId: string,
): Promise<{ item: WishlistItem; duplicate: boolean }> {
  const existing = await getWishlistItem(userId, courseId);
  if (existing) return { item: existing, duplicate: true };
  const row = await getDb().orm.public.Wishlist.create({ userId, courseId });
  return { item: mapWishlistRow(row), duplicate: false };
}

/** Remove a course from the user's wishlist. False when it was not there. */
export async function removeFromWishlist(userId: string, courseId: string): Promise<boolean> {
  const row = await getDb().orm.public.Wishlist.where({ userId, courseId }).delete();
  return row !== null;
}
