import { NextRequest, NextResponse } from 'next/server';
import { requireRoles, serviceError } from '@/lib/api-helpers';
import { importQuizPdf } from '@/lib/services/quiz-service';

/**
 * POST /api/instructor/quizzes/[id]/upload — upload an externally-AI-
 * generated quiz PDF for a draft quiz. multipart/form-data, `file` field.
 * The file is stored in the private `quiz-pdfs` bucket, parsed into
 * questions, and flagged for teacher review. Nothing is published by this
 * route.
 *
 * When the Supabase service-role key is not configured, this returns 503
 * with a plain message — never a stack trace, never the key.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['admin', 'instructor']);
  if ('error' in auth) return auth.error;
  const { id } = await params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }
  const file = form.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'A PDF file is required' }, { status: 400 });
  }
  try {
    const result = await importQuizPdf(auth.session, id, {
      name: file.name,
      type: file.type,
      size: file.size,
      arrayBuffer: await file.arrayBuffer(),
    });
    if ('error' in result) return serviceError(result);
    return NextResponse.json({ quiz: result.quiz, parsed: result.parsed });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (message.includes('SUPABASE_SERVICE_ROLE_KEY') || message.includes('Supabase URL is not set')) {
      return NextResponse.json(
        { error: 'Quiz PDF uploads are not configured yet (Supabase service-role key missing)' },
        { status: 503 },
      );
    }
    if (message.includes('Only PDF files are allowed') || message.includes('10 MB or smaller')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Quiz PDF import failed' }, { status: 500 });
  }
}
