import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea, serviceError } from '@/lib/api-helpers';
import {
  createEmailTemplateService,
  listEmailTemplatesService,
} from '@/lib/services/email-template-service';
import { isEmailConfigured } from '@/lib/email/resend';

/**
 * GET /api/admin/email-templates — list email templates.
 * Returns { templates, tableMissing }. tableMissing is true when the
 * EmailTemplate SQL migration has not run yet — the UI shows a
 * "run the SQL" state instead of an error.
 * POST /api/admin/email-templates — create a template. Body: { name,
 * subject, htmlBody, type?: 'broadcast' | 'system', isActive? }.
 *
 * Guard: requireAdminArea('email-templates') — restricted admins need
 * the 'email-templates' area granted. Full admins pass.
 */
const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  subject: z.string().trim().min(1, 'Subject is required').max(200),
  htmlBody: z.string().min(1, 'Email body is required').max(100_000),
  type: z.enum(['broadcast', 'system']).optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const auth = await requireAdminArea('email-templates');
  if ('error' in auth) return auth.error;
  const result = await listEmailTemplatesService(auth.session);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({
    templates: result.templates,
    tableMissing: result.tableMissing,
    // Whether email can actually be delivered (Resend key set).
    emailConfigured: isEmailConfigured(),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('email-templates');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid template' },
      { status: 400 },
    );
  }
  const result = await createEmailTemplateService(auth.session, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ template: result.template }, { status: 201 });
}
