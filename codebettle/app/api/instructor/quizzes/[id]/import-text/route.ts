import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, invalidBody, readJson, requireRoles, serviceError } from '@/lib/api-helpers';
import { quizTextImportSchema } from '@/lib/api-schemas';
import { importQuizText } from '@/lib/services/quiz-service';

/**
 * POST /api/instructor/quizzes/[id]/import-text — paste AI-generated
 * quiz text for a draft quiz (JSON body: { text }). The text is parsed
 * into questions (see lib/services/quiz-parser.ts parseQuizTextImport)
 * and replaces the quiz's questions. Nothing is published by this
 * route. A paste with no usable questions is rejected without touching
 * the existing questions.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['admin', 'instructor']);
  if ('error' in auth) return auth.error;
  const viewing = assertNotViewAs(auth.session);
  if (viewing) return viewing;
  const { id } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = quizTextImportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Quiz text is required' }, { status: 400 });
  }
  const result = await importQuizText(auth.session, id, parsed.data.text);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ quiz: result.quiz, parsed: result.parsed });
}
