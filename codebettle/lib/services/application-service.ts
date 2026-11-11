/**
 * Instructor-application service (Phase 3).
 *
 * submitApplication is PUBLIC (no auth) — the become-instructor form.
 * reviewApplicationService is admin-only. No Next.js imports —
 * unit-testable with the fake db. Both paths write an audit entry.
 */
import { createApplication, getApplicationById, reviewApplication } from '../db/applications';
import { getUserByEmail } from '../db/users';
import { hasAdminCapability } from '../rbac';
import { logAudit } from '../db/audit';
import { onApplicationReviewed } from './notification-service';
import { normalizeEmail } from '../security';
import type { InstructorApplication } from '../db/types';
import { badRequest, forbidden, notFound, type Actor, type ServiceError } from './errors';

type Result<T> = T | ServiceError;

export interface SubmitApplicationInput {
  name: string;
  email: string;
  phone?: string;
  expertise?: string;
  experience?: string;
  message?: string;
  /** Phase 2: optional free-text "anything else we should know". */
  additionalInfo?: string;
  /** Phase 2: "Why are you a good fit for CodeBettle?" — required by the form, nullable in the DB. */
  whyGoodFit?: string;
  cvUrl?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  demoRecordingUrl?: string;
}

/** A profile URL must be http(s) and on the expected host (linkedin.com / github.com). */
function isProfileUrl(value: string | undefined, host: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return url.hostname === host || url.hostname.endsWith(`.${host}`);
  } catch {
    return false;
  }
}

export async function submitApplication(
  input: SubmitApplicationInput,
): Promise<Result<{ application: InstructorApplication }>> {
  const name = input.name.trim();
  if (!name) return badRequest('Name is required');
  const email = normalizeEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest('Valid email required');
  const linkedinUrl = input.linkedinUrl?.trim() || undefined;
  if (!isProfileUrl(linkedinUrl, 'linkedin.com')) {
    return badRequest('LinkedIn profile must be a valid linkedin.com URL');
  }
  const githubUrl = input.githubUrl?.trim() || undefined;
  if (!isProfileUrl(githubUrl, 'github.com')) {
    return badRequest('GitHub profile must be a valid github.com URL');
  }
  const application = await createApplication({
    name,
    email,
    phone: input.phone?.trim() || undefined,
    expertise: input.expertise?.trim() || undefined,
    experience: input.experience?.trim() || undefined,
    message: input.message?.trim() || undefined,
    additionalInfo: input.additionalInfo?.trim() || undefined,
    whyGoodFit: input.whyGoodFit?.trim() || undefined,
    // Phase 2: link to the applicant's account when one exists under
    // this email, so the applicant portal can find their applications.
    // No account yet (or lookup fails) => userId stays null; the
    // application is still valid — linking is best-effort, never a
    // reason to reject a submission.
    userId: (await getUserByEmail(email))?.id,
    cvUrl: input.cvUrl?.trim() || undefined,
    linkedinUrl,
    githubUrl,
    demoRecordingUrl: input.demoRecordingUrl?.trim() || undefined,
  });
  await logAudit({
    actorId: null,
    action: 'application.submit',
    entity: 'application',
    entityId: application.id,
    detail: email,
  });
  return { application };
}

export async function reviewApplicationService(
  actor: Actor,
  applicationId: string,
  status: 'approved' | 'rejected',
): Promise<Result<{ application: InstructorApplication }>> {
  if (!hasAdminCapability(actor)) return forbidden('Only admins can review applications');
  const existing = await getApplicationById(applicationId);
  if (!existing) return notFound('Application');
  const reviewed = await reviewApplication(applicationId, { status, reviewedBy: actor.id });
  if (!reviewed) return badRequest('Application has already been reviewed');
  await logAudit({
    actorId: actor.id,
    action: 'application.review',
    entity: 'application',
    entityId: applicationId,
    detail: `${status} ${existing.email}`,
  });
  // Notify the admins (Phase 4 hook — best-effort, never throws).
  await onApplicationReviewed(reviewed, status);
  return { application: reviewed };
}
