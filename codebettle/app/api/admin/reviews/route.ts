import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import {
  areStudentReviewTablesReady,
  createStudentReview,
  listStudentReviews,
} from '@/lib/db/student-reviews';
import { validateStudentReview } from '@/lib/management';

/**
 * GET /api/admin/reviews — list all student reviews (home carousel).
 * POST — add one. Guard: requireAdminArea('reviews').
 * Includes `tablesReady` so the admin UI can show a "run the SQL" state
 * when the migration has not run yet.
 */
export async function GET() {
  const auth = await requireAdminArea('reviews');
  if ('error' in auth) return auth.error;
  const [reviews, tablesReady] = await Promise.all([listStudentReviews(), areStudentReviewTablesReady()]);
  return NextResponse.json({ reviews, tablesReady });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('reviews');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const v = body as Record<string, unknown>;
  const input = {
    fullName: typeof v.fullName === 'string' ? v.fullName : '',
    role: typeof v.role === 'string' ? v.role : '',
    photoUrl: typeof v.photoUrl === 'string' ? v.photoUrl : null,
    rating: typeof v.rating === 'number' ? v.rating : 5,
    reviewText: typeof v.reviewText === 'string' ? v.reviewText : '',
    linkedinUrl: typeof v.linkedinUrl === 'string' ? v.linkedinUrl : null,
    githubUrl: typeof v.githubUrl === 'string' ? v.githubUrl : null,
    websiteUrl: typeof v.websiteUrl === 'string' ? v.websiteUrl : null,
    order: typeof v.order === 'number' ? v.order : 0,
    enabled: typeof v.enabled === 'boolean' ? v.enabled : true,
  };
  const error = validateStudentReview(input);
  if (error) return NextResponse.json({ error }, { status: 400 });
  try {
    const review = await createStudentReview(input);
    return NextResponse.json({ review }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not add the review';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not add the review' }, { status: 500 });
  }
}
