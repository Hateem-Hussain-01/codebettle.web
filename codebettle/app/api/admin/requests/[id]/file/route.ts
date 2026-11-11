import { NextResponse } from 'next/server';
import { requireAdminArea } from '@/lib/api-helpers';
import { getSupportRequestById } from '@/lib/db/support-requests';
import { createSupportRequestFileSignedUrl } from '@/lib/services/support-request-service';

/**
 * GET /api/admin/requests/[id]/file — mint a short-lived signed URL
 * (1 hour) for a support request's attachment, so an admin can
 * view/download it from the PRIVATE `application-files` bucket
 * (Phase 3, admin only). The stored attachmentUrl is the storage
 * path, not a public URL, so it must go through here. Same 'messages'
 * area guard as the other request routes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('messages');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const requestRow = await getSupportRequestById(id);
  if (!requestRow) {
    return NextResponse.json({ error: 'Support request not found' }, { status: 404 });
  }
  if (!requestRow.attachmentUrl) {
    return NextResponse.json({ error: 'No attachment was uploaded' }, { status: 404 });
  }
  try {
    const url = await createSupportRequestFileSignedUrl(requestRow.attachmentUrl);
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
