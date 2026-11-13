import { NextRequest, NextResponse } from 'next/server';
import { requireAdminArea, serviceError } from '@/lib/api-helpers';
import { sendTestEmailService } from '@/lib/services/email-template-service';

/**
 * POST /api/admin/email-templates/[id]/test — send a test email of
 * the template to the signed-in admin's own email address, resolved
 * with sample data. Best-effort: when Resend is not configured the
 * response is { sent: false, reason: 'email-not-configured' } (HTTP
 * 200 — not an error), so the UI can explain that email delivery
 * still needs the Resend key + domain verification.
 *
 * Guard: requireAdminArea('email-templates').
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminArea('email-templates');
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const result = await sendTestEmailService(auth.session, id, auth.session.email);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ sent: result.sent, reason: result.reason, to: auth.session.email });
}
