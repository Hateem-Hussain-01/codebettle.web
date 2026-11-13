import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { getAdminSuccessStory } from '@/lib/services/success-story-service';
import { createSuccessStoryEvidenceSignedUrl } from '@/lib/services/success-story-storage';

/**
 * GET /api/admin/success-stories/[id]/file?evidence=<evidenceId>
 * — mint a short-lived signed URL (1 hour) for one evidence file in a
 * submission, so an admin can view/download it from the PRIVATE
 * `application-files` bucket.
 *
 * Guard: requireAdminArea('success-stories') — anonymous/public users
 * never get a signed URL. The evidence row is verified to belong to
 * this submission before minting anything, so one submission's files
 * cannot be opened through another submission's id. Link-type evidence
 * is a plain URL and needs no signed URL (400).
 * Returns { url, name, size, mime } or 404.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('success-stories');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const evidenceId = request.nextUrl.searchParams.get('evidence');
  if (!evidenceId) {
    return NextResponse.json({ error: 'An evidence id is required (?evidence=<id>)' }, { status: 400 });
  }
  const submission = await getAdminSuccessStory(id);
  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  }
  const evidence = submission.achievements
    .flatMap((a) => a.evidence)
    .find((e) => e.id === evidenceId);
  if (!evidence) {
    return NextResponse.json({ error: 'Evidence not found' }, { status: 404 });
  }
  if (evidence.kind !== 'file') {
    return NextResponse.json({ error: 'Links do not need a signed URL' }, { status: 400 });
  }
  try {
    const url = await createSuccessStoryEvidenceSignedUrl(evidence.url);
    return NextResponse.json({
      url,
      name: evidence.fileName ?? evidence.label ?? 'evidence',
      size: evidence.size,
      mime: evidence.mime,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not open the file';
    if (/SUPABASE_SERVICE_ROLE_KEY is not set|Supabase URL is not set/.test(message)) {
      return NextResponse.json({ error: 'File storage is not configured yet' }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
