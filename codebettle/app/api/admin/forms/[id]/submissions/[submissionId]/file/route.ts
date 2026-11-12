import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea, serviceError } from '@/lib/api-helpers';
import { getFormFileService } from '@/lib/services/form-service';

/**
 * GET /api/admin/forms/[id]/submissions/[submissionId]/file?field=<fieldId>
 * — mint a short-lived signed URL (1 hour) for one uploaded file in a
 * submission, so an admin can view/download it from the PRIVATE
 * `application-files` bucket.
 *
 * Guard: requireAdminArea('forms') — anonymous/public users never get
 * a signed URL (401 when signed out, 403 for non-admins). The service
 * verifies the submission belongs to this form AND the stored path
 * belongs to this form before minting anything, so one form's files
 * cannot be opened through another form's ids.
 * Returns { url, name, size, mime } or 404 when the field has no file.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; submissionId: string }> },
) {
  const auth = await requireAdminArea('forms');
  if ('error' in auth) return auth.error;
  const { id, submissionId } = await params;
  const fieldId = request.nextUrl.searchParams.get('field');
  if (!fieldId) {
    return NextResponse.json({ error: 'A field is required (?field=<fieldId>)' }, { status: 400 });
  }
  const result = await getFormFileService(auth.session, id, submissionId, fieldId);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({
    url: result.url,
    name: result.name,
    size: result.size,
    mime: result.mime,
  });
}
