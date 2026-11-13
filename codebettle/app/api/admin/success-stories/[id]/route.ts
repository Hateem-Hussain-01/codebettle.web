import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea, requireFullAdmin } from '@/lib/api-helpers';
import {
  adminStoryMediaUrls,
  deleteSuccessStory,
  editSuccessStoryDetails,
  getAdminSuccessStory,
  reviewSuccessStory,
} from '@/lib/services/success-story-service';
import { SUCCESS_STORY_LIMITS } from '@/lib/success-story-validation';

/**
 * GET /api/admin/success-stories/[id] — full submission detail
 * (profile picture + video URLs, achievements + evidence, social
 * links, consent flags, admin note). Guard: requireAdminArea.
 *
 * PATCH — review or edit. Body:
 *   { status: 'pending'|'under_review'|'approved'|'rejected',
 *     featured?: boolean, adminNote?: string | null }  (review), or
 *   { details: { fullName?, country?, city?, designation?,
 *     courseTitle?, batchNumber?, skillsLearned?, experience?,
 *     story?, beforeJoining?, challenges?, howHelped?,
 *     achievementsAfter?, biggestAchievement?, advice? } } (edit).
 * Guard: requireAdminArea.
 *
 * DELETE — delete the submission and its stored files. Guard:
 * requireFullAdmin (destructive + "when authorized" per spec).
 */
const reviewSchema = z.object({
  status: z.enum(['pending', 'under_review', 'approved', 'rejected']),
  featured: z.boolean().optional(),
  adminNote: z.string().max(SUCCESS_STORY_LIMITS.adminNote).nullable().optional(),
});

const detailsSchema = z.object({
  fullName: z.string().trim().min(1).max(SUCCESS_STORY_LIMITS.fullName).optional(),
  country: z.string().trim().min(1).max(SUCCESS_STORY_LIMITS.country).optional(),
  city: z.string().trim().max(SUCCESS_STORY_LIMITS.city).nullable().optional(),
  designation: z.string().trim().max(SUCCESS_STORY_LIMITS.designation).nullable().optional(),
  courseTitle: z.string().trim().min(1).max(SUCCESS_STORY_LIMITS.courseTitle).optional(),
  batchNumber: z.number().int().min(1).nullable().optional(),
  skillsLearned: z.string().trim().min(1).max(SUCCESS_STORY_LIMITS.skillsLearned).optional(),
  experience: z.string().trim().min(1).max(SUCCESS_STORY_LIMITS.experience).optional(),
  story: z.string().trim().min(1).max(SUCCESS_STORY_LIMITS.story).optional(),
  beforeJoining: z.string().trim().max(SUCCESS_STORY_LIMITS.beforeJoining).nullable().optional(),
  challenges: z.string().trim().max(SUCCESS_STORY_LIMITS.challenges).nullable().optional(),
  howHelped: z.string().trim().max(SUCCESS_STORY_LIMITS.howHelped).nullable().optional(),
  achievementsAfter: z.string().trim().max(SUCCESS_STORY_LIMITS.achievementsAfter).nullable().optional(),
  biggestAchievement: z.string().trim().max(SUCCESS_STORY_LIMITS.biggestAchievement).nullable().optional(),
  advice: z.string().trim().max(SUCCESS_STORY_LIMITS.advice).nullable().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('success-stories');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const submission = await getAdminSuccessStory(id);
  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  }
  return NextResponse.json({ submission, media: adminStoryMediaUrls(submission) });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('success-stories');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const v = body as Record<string, unknown>;

  if (v.status !== undefined) {
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid review' },
        { status: 400 },
      );
    }
    const updated = await reviewSuccessStory(id, {
      status: parsed.data.status,
      featured: parsed.data.featured,
      adminNote: parsed.data.adminNote,
      reviewedBy: auth.session.id,
    });
    if (!updated) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    return NextResponse.json({ submission: updated });
  }

  if (v.details !== undefined) {
    const parsed = detailsSchema.safeParse(v.details);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid story details' },
        { status: 400 },
      );
    }
    const updated = await editSuccessStoryDetails(id, parsed.data);
    if (!updated) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    return NextResponse.json({ submission: updated });
  }

  return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireFullAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const deleted = await deleteSuccessStory(id);
  if (!deleted) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
