import { connection } from 'next/server';
import ReviewsClient from './reviews-client';

/**
 * Admin > Reviews (PR #32) — the home page reviews carousel.
 * Server wrapper only: the list loads client-side from
 * GET /api/admin/reviews. The admin layout enforces the 'reviews'
 * area server-side.
 */
export default async function AdminReviewsPage() {
  await connection();
  return <ReviewsClient />;
}
