import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, requireFullAdmin } from '@/lib/api-helpers';
import { deleteStudentReview, getStudentReviewById, updateStudentReview } from '@/lib/db/student-reviews';
import { validateStudentReview } from '@/lib/management';

/**
 * PATCH /api/admin/reviews/[id] — edit a review (any subset of fields,
 * including the enabled toggle and the carousel order). Guard:
 * requireAdminArea('reviews').
 *
 * DELETE — remove a review. Guard: requireFullAdmin (destructive).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('reviews');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const current = await getStudentReviewById(id);
  if (!current) return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  const v = body as Record<string, unknown>;
  const merged = {
    fullName: typeof v.fullName === 'string' ? v.fullName : current.fullName,
    role: typeof v.role === 'string' ? v.role : current.role,
    photoUrl: typeof v.photoUrl === 'string' ? v.photoUrl : v.photoUrl === null ? null : current.photoUrl ?? null,
    rating: typeof v.rating === 'number' ? v.rating : current.rating,
    reviewText: typeof v.reviewText === 'string' ? v.reviewText : current.reviewText,
    linkedinUrl: typeof v.linkedinUrl === 'string' ? v.linkedinUrl : v.linkedinUrl === null ? null : current.linkedinUrl ?? null,
    githubUrl: typeof v.githubUrl === 'string' ? v.githubUrl : v.githubUrl === null ? null : current.githubUrl ?? null,
    websiteUrl: typeof v.websiteUrl === 'string' ? v.websiteUrl : v.websiteUrl === null ? null : current.websiteUrl ?? null,
    order: typeof v.order === 'number' ? v.order : current.order,
  };
  const error = validateStudentReview(merged);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const patch: Record<string, unknown> = { ...merged };
  if (typeof v.enabled === 'boolean') patch.enabled = v.enabled;
  try {
    const review = await updateStudentReview(id, patch);
    if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    return NextResponse.json({ review });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not update the review';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not update the review' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireFullAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  try {
    const deleted = await deleteStudentReview(id);
    if (!deleted) return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not delete the review';
    if (/not set up yet/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not delete the review' }, { status: 500 });
  }
}
