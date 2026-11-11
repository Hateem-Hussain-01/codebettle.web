import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-helpers';
import { getApplicationById } from '@/lib/db/applications';
import { createApplicationFileSignedUrl } from '@/lib/services/application-storage';

/**
 * GET /api/admin/applications/[id]/file?kind=cv|demo — mint a short-lived
 * signed URL (1 hour) for the application's CV or demo recording, so an
 * admin can view/download it from the PRIVATE `application-files`
 * bucket. Admin only. The stored cvUrl / demoRecordingUrl is the
 * storage path, not a public URL, so it must go through here.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const kind = request.nextUrl.searchParams.get('kind');
  if (kind !== 'cv' && kind !== 'demo') {
    return NextResponse.json({ error: 'A file kind is required (cv or demo)' }, { status: 400 });
  }
  const application = await getApplicationById(id);
  if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  const path = kind === 'cv' ? application.cvUrl : application.demoRecordingUrl;
  if (!path) {
    return NextResponse.json(
      { error: kind === 'cv' ? 'No CV was uploaded' : 'No demo recording was uploaded' },
      { status: 404 },
    );
  }
  try {
    const url = await createApplicationFileSignedUrl(path);
    return NextResponse.json({ url });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (
      message.includes('SUPABASE_SERVICE_ROLE_KEY') ||
      message.includes('Supabase URL is not set')
    ) {
      return NextResponse.json(
        { error: 'File access is not configured yet (Supabase service-role key missing)' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'Could not open the file' }, { status: 500 });
  }
}
