import { NextRequest, NextResponse } from 'next/server';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import { applicationRequestInfoSchema } from '@/lib/api-schemas';
import { requestInfo } from '@/lib/services/recruitment-service';

/**
 * POST /api/admin/applications/[id]/request-info — ask a pending
 * applicant for more information. Writes an info_requested history
 * entry + audit log and notifies the applicant with the message.
 * The application stays pending. Admin only (applications area).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminArea('applications');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = applicationRequestInfoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Tell the applicant what you need from them' }, { status: 400 });
  }
  const result = await requestInfo(auth.session, id, parsed.data.note);
  if ('error' in result) return serviceError(result);
  return NextResponse.json(result);
}
