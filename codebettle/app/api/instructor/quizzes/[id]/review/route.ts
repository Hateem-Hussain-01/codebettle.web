import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireRoles, serviceError } from '@/lib/api-helpers';
import { quizReviewSchema } from '@/lib/api-schemas';
import { saveQuizReview } from '@/lib/services/quiz-service';

/**
 * POST /api/instructor/quizzes/[id]/review — save the teacher's review of
 * the parsed questions. Draft only. Questions whose answer key is missing
 * or wrong come back flagged needsReview, so the quiz still cannot publish.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['admin', 'instructor']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = quizReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'A list of questions is required' }, { status: 400 });
  }
  const result = await saveQuizReview(auth.session, id, parsed.data.questions);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ quiz: result.quiz });
}
