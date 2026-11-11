import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, invalidBody, readJson, requireRoles, serviceError } from '@/lib/api-helpers';
import { quizUpdateSchema } from '@/lib/api-schemas';
import {
  deleteQuiz,
  getQuizForTeacher,
  publishQuiz,
  setQuizStatus,
  updateQuizForTeacher,
} from '@/lib/services/quiz-service';

/** GET /api/instructor/quizzes/[id] — full quiz with questions and key (teacher only). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['admin', 'instructor']);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const result = await getQuizForTeacher(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ quiz: result.quiz });
}

/** PATCH /api/instructor/quizzes/[id] — edit metadata, or action=publish|unpublish|archive. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['admin', 'instructor']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const { id } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = quizUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid quiz data' }, { status: 400 });
  }
  const { action, ...input } = parsed.data;
  let result;
  if (action === 'publish') {
    result = await publishQuiz(auth.session, id);
  } else if (action === 'unpublish') {
    result = await setQuizStatus(auth.session, id, 'draft');
  } else if (action === 'archive') {
    result = await setQuizStatus(auth.session, id, 'archived');
  } else {
    result = await updateQuizForTeacher(auth.session, id, input);
  }
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ quiz: result.quiz });
}

/** DELETE /api/instructor/quizzes/[id] — delete a draft quiz (published must be archived first). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['admin', 'instructor']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const { id } = await params;
  const result = await deleteQuiz(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ deleted: true });
}
