import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import { createSuccessStorySignedUpload } from '@/lib/services/success-story-storage';

/**
 * POST /api/admin/success-stories-management/video-upload-url — mint a
 * signed upload URL for the Success Stories page video (admin only,
 * `success-stories-management` area). The browser PUTs the file
 * DIRECTLY to Supabase Storage — the video never travels through the
 * API route, which is what makes the 100 MB limit honest (Vercel
 * serverless functions cap request payloads at ~4.5 MB).
 *
 * Body: { mime: string, size: number } — video/mp4, video/webm or
 * video/quicktime, max 100 MB. Returns { signedUrl, path, bucket,
 * expiresInSeconds }. The client then calls POST /video with the path
 * to verify the upload and save it as the page video.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('success-stories-management');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const v = body as Record<string, unknown>;
  if (typeof v.mime !== 'string' || typeof v.size !== 'number') {
    return NextResponse.json({ error: 'File type and size are required' }, { status: 400 });
  }
  try {
    const signed = await createSuccessStorySignedUpload('video', v.mime, v.size);
    return NextResponse.json(signed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not prepare the upload';
    if (/SUPABASE_SERVICE_ROLE_KEY is not set|Supabase URL is not set/.test(message)) {
      return NextResponse.json({ error: 'Video uploads are not configured yet' }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
