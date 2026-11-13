/**
 * Ambassador-application repository (PR #33).
 *
 * Campus ambassador applications from /become-ambassador. EXACT fields
 * from Eman's Google Form 'CodeBettle Ambassador' (13 Nov 2026
 * ~22:19 PKT) — all 8 required: Name, WhatsApp, Email, University /
 * Institute Name, Department & Semester (ONE field), leadership
 * position (radio), promotion plan (long text), prior ambassador
 * experience (Yes/No). Admins review applications in the Ambassador
 * Applications section (list, view, approve/reject).
 *
 * FAIL-SAFE (same shape as lib/db/batches.ts): the
 * AmbassadorApplication table arrives via migration
 * 20261113T1847_add_footer_bookcall_ambassador, which Eman runs
 * himself in the Supabase SQL Editor. Until it runs, reads return
 * empty (the page/admin show a "run the SQL" state) and writes
 * return a clear error telling the admin to run the SQL first.
 */
import { getDb } from './client';
import { mapAmbassadorApplicationRow } from './mappers';
import { parsePageParams, toPage, type Page } from './pagination';
import type { AmbassadorApplication, AmbassadorApplicationStatus } from './types';

/** True when the error is "relation does not exist" for the AmbassadorApplication table (migration not run yet). */
export function isMissingAmbassadorApplicationTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';
  const namesAmbassador = text.includes('AmbassadorApplication');
  if (code === '42P01' && namesAmbassador) return true;
  return /relation .* does not exist/i.test(text) && namesAmbassador;
}

export const AMBASSADOR_APPLICATION_TABLE_MISSING_MESSAGE =
  'The AmbassadorApplication table is not set up yet — run codebettle-footer-bookcall-migration.sql in the Supabase SQL Editor first.';

/** Cheap probe: true when the table exists (migration has run). */
export async function isAmbassadorApplicationTableReady(): Promise<boolean> {
  try {
    await getDb().orm.public.AmbassadorApplication.orderBy((a) => a.createdAt.desc()).limit(1).all();
    return true;
  } catch (error) {
    if (isMissingAmbassadorApplicationTableError(error)) return false;
    throw error;
  }
}

/** A read that returns the fallback when the table is missing, instead of throwing. */
async function withAmbassadorApplicationTableFallback<T>(fetch: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fetch();
  } catch (error) {
    if (isMissingAmbassadorApplicationTableError(error)) return fallback;
    throw error;
  }
}

function throwIfTableMissing(error: unknown): never {
  if (isMissingAmbassadorApplicationTableError(error)) {
    throw new Error(AMBASSADOR_APPLICATION_TABLE_MISSING_MESSAGE);
  }
  throw error;
}

export interface CreateAmbassadorApplicationInput {
  fullName: string;
  whatsapp: string;
  email: string;
  university: string;
  departmentSemester: string;
  leadershipPosition: string;
  promotionPlan: string;
  priorAmbassadorExperience: string;
}

export async function createAmbassadorApplication(
  input: CreateAmbassadorApplicationInput,
): Promise<AmbassadorApplication> {
  try {
    const row = await getDb().orm.public.AmbassadorApplication.create({
      fullName: input.fullName,
      whatsapp: input.whatsapp,
      email: input.email,
      university: input.university,
      departmentSemester: input.departmentSemester,
      leadershipPosition: input.leadershipPosition,
      promotionPlan: input.promotionPlan,
      priorAmbassadorExperience: input.priorAmbassadorExperience,
      // Explicit (the DB also defaults it): the fake test db has no
      // column defaults, so relying on the default would leave status
      // undefined.
      status: 'pending',
    });
    return mapAmbassadorApplicationRow(row);
  } catch (error) {
    throwIfTableMissing(error);
  }
}

export interface ListAmbassadorApplicationsOptions {
  page?: string | string[];
  limit?: string | string[];
  status?: AmbassadorApplicationStatus;
}

/** Newest first, paginated (admin Ambassador Applications section). Optional status filter. */
export async function listAmbassadorApplications(
  opts: ListAmbassadorApplicationsOptions = {},
): Promise<Page<AmbassadorApplication>> {
  return withAmbassadorApplicationTableFallback(async () => {
    const params = parsePageParams({ page: opts.page, limit: opts.limit });
    let query = getDb().orm.public.AmbassadorApplication;
    const status = opts.status;
    if (status) query = query.where((a) => a.status.eq(status));
    const total = (await query.all()).length;
    const rows = await query.orderBy((a) => a.createdAt.desc()).limit(params.limit).offset(params.offset).all();
    return toPage(rows.map(mapAmbassadorApplicationRow), total, params);
  }, toPage<AmbassadorApplication>([], 0, parsePageParams({ page: opts.page, limit: opts.limit })));
}

export async function getAmbassadorApplicationById(id: string): Promise<AmbassadorApplication | null> {
  return withAmbassadorApplicationTableFallback(async () => {
    const row = await getDb().orm.public.AmbassadorApplication.where({ id }).first();
    if (!row) return null;
    return mapAmbassadorApplicationRow(row);
  }, null);
}

export async function updateAmbassadorApplicationStatus(
  id: string,
  status: AmbassadorApplicationStatus,
): Promise<AmbassadorApplication | null> {
  try {
    const row = await getDb().orm.public.AmbassadorApplication.where({ id }).first();
    if (!row) return null;
    const updated = await getDb().orm.public.AmbassadorApplication.where({ id }).update({ status });
    if (!updated) return null;
    return mapAmbassadorApplicationRow(updated);
  } catch (error) {
    throwIfTableMissing(error);
  }
}

export async function deleteAmbassadorApplication(id: string): Promise<boolean> {
  try {
    const row = await getDb().orm.public.AmbassadorApplication.where({ id }).first();
    if (!row) return false;
    await getDb().orm.public.AmbassadorApplication.where({ id }).delete();
    return true;
  } catch (error) {
    throwIfTableMissing(error);
  }
}
