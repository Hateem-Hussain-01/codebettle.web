import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdminArea } from '@/lib/api-helpers';
import { renderEmailTemplate } from '@/lib/services/email-template-service';
import { samplePlaceholderValues } from '@/lib/email/placeholders';
import { getAppBaseUrl } from '@/lib/email/resend';

/**
 * POST /api/admin/email-templates/preview — render a draft template
 * (subject + HTML body) with sample data, exactly as the test email
 * would send it. Used by the builder preview. Needs no database
 * access, so it works even before the EmailTemplate SQL has run.
 * Body: { subject: string, htmlBody: string }.
 *
 * Guard: requireAdminArea('email-templates').
 */
const previewSchema = z.object({
  subject: z.string().max(200),
  htmlBody: z.string().max(100_000),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminArea('email-templates');
  if ('error' in auth) return auth.error;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid preview' },
      { status: 400 },
    );
  }
  const siteUrl = getAppBaseUrl();
  const rendered = renderEmailTemplate(
    { name: 'Preview', subject: parsed.data.subject, htmlBody: parsed.data.htmlBody },
    samplePlaceholderValues(siteUrl),
    siteUrl,
  );
  return NextResponse.json(rendered);
}
