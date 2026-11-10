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

export interface CreateApplicationInput {
  name: string;
  email: string;
  phone?: string;
  expertise?: string;
  experience?: string;
  message?: string;
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
    status: 'pending',
  });
  return mapApplicationRow(row);
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
