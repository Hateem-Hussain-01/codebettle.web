import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import {
  deleteEmailTemplateService,
  getEmailTemplateService,
  updateEmailTemplateService,
} from '@/lib/services/email-template-service';

/**
 * GET /api/admin/email-templates/[id] — one email template.
 * PATCH /api/admin/email-templates/[id] — update it. Body: any of
 * { name, subject, htmlBody, type, isActive }.
 * DELETE /api/admin/email-templates/[id] — delete it.
 *
 * Guard: requireAdminArea('email-templates').
 */
const patchSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100).optional(),
  subject: z.string().trim().min(1, 'Subject is required').max(200).optional(),
  htmlBody: z.string().min(1, 'Email body is required').max(100_000).optional(),
  type: z.enum(['broadcast', 'system']).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('email-templates');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const result = await getEmailTemplateService(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ template: result.template });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('email-templates');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid update' },
      { status: 400 },
    );
  }
  const result = await updateEmailTemplateService(auth.session, id, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ template: result.template });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('email-templates');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const result = await deleteEmailTemplateService(auth.session, id);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ success: true });
}
