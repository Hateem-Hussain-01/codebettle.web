/**
 * Book-a-call repository (PR #33).
 *
 * Free career-guidance call requests from /book-a-call. The booking
 * is saved first; the email to the 3 recipients is best-effort
 * (Resend may not be configured) and never blocks the save — so the
 * repository never sends email, it only persists the request.
 *
 * FAIL-SAFE (same shape as lib/db/batches.ts): the BookACall table
 * arrives via migration 20261113T1847_add_footer_bookcall_ambassador,
 * which Eman runs himself in the Supabase SQL Editor. Until it runs,
 * reads return empty (the page/admin show a "run the SQL" state) and
 * writes return a clear error telling the admin to run the SQL first.
 */
import { getDb } from './client';
import { mapBookACallRow } from './mappers';
import { parsePageParams, toPage, type Page } from './pagination';
import type { BookACall, BookACallStatus } from './types';

/** True when the error is "relation does not exist" for the BookACall table (migration not run yet). */
export function isMissingBookACallTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';
  const namesBookACall = text.includes('BookACall');
  if (code === '42P01' && namesBookACall) return true;
  return /relation .* does not exist/i.test(text) && namesBookACall;
}

export const BOOK_A_CALL_TABLE_MISSING_MESSAGE =
  'The BookACall table is not set up yet — run codebettle-footer-bookcall-migration.sql in the Supabase SQL Editor first.';

/** Cheap probe: true when the table exists (migration has run). */
export async function isBookACallTableReady(): Promise<boolean> {
  try {
    await getDb().orm.public.BookACall.orderBy((b) => b.createdAt.desc()).limit(1).all();
    return true;
  } catch (error) {
    if (isMissingBookACallTableError(error)) return false;
    throw error;
  }
}

/** A read that returns the fallback when the table is missing, instead of throwing. */
async function withBookACallTableFallback<T>(fetch: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fetch();
  } catch (error) {
    if (isMissingBookACallTableError(error)) return fallback;
    throw error;
  }
}

function throwIfTableMissing(error: unknown): never {
  if (isMissingBookACallTableError(error)) {
    throw new Error(BOOK_A_CALL_TABLE_MISSING_MESSAGE);
  }
  throw error;
}

export interface CreateBookACallInput {
  fullName: string;
  email: string;
  phone?: string;
  currentStatus: string;
  courseInterest?: string;
  guidanceNeeded: string;
  preferredContact?: string;
}

export async function createBookACall(input: CreateBookACallInput): Promise<BookACall> {
  try {
    const row = await getDb().orm.public.BookACall.create({
      fullName: input.fullName,
      email: input.email,
      phone: input.phone ?? null,
      currentStatus: input.currentStatus,
      courseInterest: input.courseInterest ?? null,
      guidanceNeeded: input.guidanceNeeded,
      preferredContact: input.preferredContact ?? null,
      // Explicit (the DB also defaults it): the fake test db has no
      // column defaults, so relying on the default would leave status
      // undefined.
      status: 'new',
    });
    return mapBookACallRow(row);
  } catch (error) {
    throwIfTableMissing(error);
  }
}

export interface ListBookACallsOptions {
  page?: string | string[];
  limit?: string | string[];
  status?: BookACallStatus;
}

/** Newest first, paginated (admin Book a Call section). Optional status filter. */
export async function listBookACalls(opts: ListBookACallsOptions = {}): Promise<Page<BookACall>> {
  return withBookACallTableFallback(async () => {
    const params = parsePageParams({ page: opts.page, limit: opts.limit });
    let query = getDb().orm.public.BookACall;
    const status = opts.status;
    if (status) query = query.where((b) => b.status.eq(status));
    const total = (await query.all()).length;
    const rows = await query.orderBy((b) => b.createdAt.desc()).limit(params.limit).offset(params.offset).all();
    return toPage(rows.map(mapBookACallRow), total, params);
  }, toPage<BookACall>([], 0, parsePageParams({ page: opts.page, limit: opts.limit })));
}

export async function getBookACallById(id: string): Promise<BookACall | null> {
  return withBookACallTableFallback(async () => {
    const row = await getDb().orm.public.BookACall.where({ id }).first();
    if (!row) return null;
    return mapBookACallRow(row);
  }, null);
}

export async function updateBookACallStatus(id: string, status: BookACallStatus): Promise<BookACall | null> {
  try {
    const row = await getDb().orm.public.BookACall.where({ id }).first();
    if (!row) return null;
    const updated = await getDb().orm.public.BookACall.where({ id }).update({ status });
    if (!updated) return null;
    return mapBookACallRow(updated);
  } catch (error) {
    throwIfTableMissing(error);
  }
}

export async function deleteBookACall(id: string): Promise<boolean> {
  try {
    const row = await getDb().orm.public.BookACall.where({ id }).first();
    if (!row) return false;
    await getDb().orm.public.BookACall.where({ id }).delete();
    return true;
  } catch (error) {
    throwIfTableMissing(error);
  }
}
