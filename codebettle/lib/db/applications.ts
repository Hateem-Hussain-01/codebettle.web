/**
 * Instructor-application repository (Phase 3).
 *
 * The become-instructor form was client-side only (fake 1s delay, nothing
 * stored). These functions persist applications in the contract's
 * InstructorApplication table. Review transitions are enforced here as
 * well as in the service: reviewApplication only matches pending rows,
 * so an already-reviewed application cannot be reviewed twice.
 */
import { getDb } from './client';
import { dateToString } from './mappers';
import { parsePageParams, toPage, type Page } from './pagination';
import type { ApplicationRow, ApplicationStatus, InstructorApplication } from './types';

export function mapApplicationRow(row: ApplicationRow): InstructorApplication {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? undefined,
    expertise: row.expertise ?? undefined,
    experience: row.experience ?? undefined,
    message: row.message ?? undefined,
    additionalInfo: row.additionalInfo ?? undefined,
    whyGoodFit: row.whyGoodFit ?? undefined,
    userId: row.userId ?? undefined,
    cvUrl: row.cvUrl ?? undefined,
    linkedinUrl: row.linkedinUrl ?? undefined,
    githubUrl: row.githubUrl ?? undefined,
    demoRecordingUrl: row.demoRecordingUrl ?? undefined,
    status: row.status,
    reviewedBy: row.reviewedBy ?? undefined,
    createdAt: dateToString(row.createdAt),
  };
}

export interface ListApplicationsOptions {
  status?: ApplicationStatus;
  page?: string | string[];
  limit?: string | string[];
}

/** Paginated application list (admin). Newest first. */
export async function listApplications(
  opts: ListApplicationsOptions = {},
): Promise<Page<InstructorApplication>> {
  const params = parsePageParams({ page: opts.page, limit: opts.limit });
  let query = getDb().orm.public.InstructorApplication;
  if (opts.status) query = query.where({ status: opts.status });
  const total = (await query.all()).length;
  const rows = await query.orderBy((a) => a.createdAt.desc()).limit(params.limit).offset(params.offset).all();
  return toPage(rows.map(mapApplicationRow), total, params);
}

export async function getApplicationById(id: string): Promise<InstructorApplication | null> {
  const row = await getDb().orm.public.InstructorApplication.where({ id }).first();
  if (!row) return null;
  return mapApplicationRow(row);
}

/**
 * Phase 2: applications filed by one account (userId is set at submit
 * time by matching the applicant's email to a User). The applicant
 * portal uses this — "this user is an applicant" means "a row exists
 * with userId = their id" (see the Phase 2 report for the full
 * recommendation). Newest first.
 */
export async function getApplicationsByUserId(userId: string): Promise<InstructorApplication[]> {
  const rows = await getDb()
    .orm.public.InstructorApplication.where({ userId })
    .orderBy((a) => a.createdAt.desc())
    .all();
  return rows.map(mapApplicationRow);
}

/** Phase 2: find an application by the applicant's email (used to link userId at submit time). */
export async function getApplicationByEmail(email: string): Promise<InstructorApplication | null> {
  const row = await getDb()
    .orm.public.InstructorApplication.where((a) => a.email.eq(email))
    .orderBy((a) => a.createdAt.desc())
    .first();
  if (!row) return null;
  return mapApplicationRow(row);
}

/**
 * Phase 2 (Module 3): the applicant's PENDING application for this
 * email, if any — the duplicate check. A reviewed (approved/rejected)
 * application does not block a fresh one, so only pending rows count.
 */
export async function getPendingApplicationByEmail(email: string): Promise<InstructorApplication | null> {
  const row = await getDb()
    .orm.public.InstructorApplication.where((a) => a.email.eq(email))
    .where((a) => a.status.eq('pending'))
    .orderBy((a) => a.createdAt.desc())
    .first();
  if (!row) return null;
  return mapApplicationRow(row);
}

export interface CreateApplicationInput {
  name: string;
  email: string;
  phone?: string;
  expertise?: string;
  experience?: string;
  message?: string;
  /** Phase 2: optional free-text "anything else we should know". */
  additionalInfo?: string;
  /** Phase 2: "Why are you a good fit?" — validated in the service, nullable in the DB. */
  whyGoodFit?: string;
  /** Phase 2: applicant's account id (matched by email at submit time). */
  userId?: string;
  cvUrl?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  demoRecordingUrl?: string;
}

/** Create a pending application. No auth — the public form calls this. */
export async function createApplication(input: CreateApplicationInput): Promise<InstructorApplication> {
  const row = await getDb().orm.public.InstructorApplication.create({
    name: input.name,
    email: input.email,
    phone: input.phone ?? null,
    expertise: input.expertise ?? null,
    experience: input.experience ?? null,
    message: input.message ?? null,
    additionalInfo: input.additionalInfo ?? null,
    whyGoodFit: input.whyGoodFit ?? null,
    userId: input.userId ?? null,
    cvUrl: input.cvUrl ?? null,
    linkedinUrl: input.linkedinUrl ?? null,
    githubUrl: input.githubUrl ?? null,
    demoRecordingUrl: input.demoRecordingUrl ?? null,
    status: 'pending',
  });
  return mapApplicationRow(row);
}

/**
 * Phase 7 (GAP #B6): link every still-unlinked application filed
 * under this email to a newly created account. Only rows with userId
 * NULL are touched — an application already linked to an account is
 * never re-pointed. Emails are matched exactly: both the public form
 * (submitApplication) and registration (registerUser) normalise the
 * email first (trim + lowercase). Returns the number linked.
 */
export async function linkUnlinkedApplicationsToUser(
  email: string,
  userId: string,
): Promise<number> {
  const rows = await getDb()
    .orm.public.InstructorApplication.where((a) => a.email.eq(email))
    .where((a) => a.userId.isNull())
    .updateAll({ userId });
  return rows.length;
}

/**
 * Review an application. Only a pending application can move to approved
 * or rejected (the where clause enforces it); returns null otherwise.
 */
export async function reviewApplication(
  id: string,
  input: { status: 'approved' | 'rejected'; reviewedBy: string },
): Promise<InstructorApplication | null> {
  const row = await getDb()
    .orm.public.InstructorApplication.where({ id })
    .where((a) => a.status.eq('pending'))
    .update({ status: input.status, reviewedBy: input.reviewedBy });
  if (!row) return null;
  return getApplicationById(id);
}
