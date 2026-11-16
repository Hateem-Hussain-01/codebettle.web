import { NextRequest, NextResponse } from 'next/server';
import { assertNotViewAs, invalidBody, readJson, requireSession, serviceError } from '@/lib/api-helpers';
import { applicationCreateSchema } from '@/lib/api-schemas';
import { createApplicantApplication, listMyApplications } from '@/lib/services/recruitment-service';

/**
 * GET /api/applicant/applications — the signed-in user's own
 * applications (tracking summaries). Any signed-in user may list
 * their OWN applications — including onboarded teachers (their
 * Teacher Portal → My Profile section reads this) — ownership is
 * the only gate: getApplicationsByUserId(session.id).
 * POST /api/applicant/applications — file a new application from the
 * applicant portal. Same fields + validation as the public
 * become-instructor form (applicationCreateSchema), plus the portal
 * duplicate rule (one pending application at a time) and the
 * email-must-match-your-account rule in the service.
 */
export async function GET() {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const result = await listMyApplications(auth.session);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  // View-as is view-only: a viewing admin must not file a
  // recruitment application as the viewed teacher (the service
  // requires the application email to match the account email, so
  // without this check the viewed person's identity would be
  // usable). GET (listing their own applications) stays open —
  // reads are the point of viewing.
  const viewOnly = assertNotViewAs(auth.session);
  if (viewOnly) return viewOnly;
  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = applicationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Name, email, CV, demo recording, LinkedIn and why you are a good fit are required' }, { status: 400 });
  }
  const result = await createApplicantApplication(auth.session, parsed.data);
  if ('error' in result) return serviceError(result);
  return NextResponse.json({ application: result.application }, { status: 201 });
}
