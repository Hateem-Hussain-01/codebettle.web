/**
 * Instructor-application service (Phase 3).
 *
 * submitApplication is PUBLIC (no auth) — the become-instructor form.
 * reviewApplicationService is admin-only. No Next.js imports —
 * unit-testable with the fake db. Both paths write an audit entry.
 */
import { createApplication, getApplicationById, reviewApplication } from '../db/applications';
import { logAudit } from '../db/audit';
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
}

export async function submitApplication(
  input: SubmitApplicationInput,
): Promise<Result<{ application: InstructorApplication }>> {
  const name = input.name.trim();
  if (!name) return badRequest('Name is required');
  const email = normalizeEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest('Valid email required');
  const application = await createApplication({
    name,
    email,
    phone: input.phone?.trim() || undefined,
    expertise: input.expertise?.trim() || undefined,
    experience: input.experience?.trim() || undefined,
    message: input.message?.trim() || undefined,
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
  if (actor.role !== 'admin') return forbidden('Only admins can review applications');
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
  return { application: reviewed };
}
