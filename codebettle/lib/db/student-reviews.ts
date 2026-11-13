/**
 * Student review repository (PR #32 — home "What Our Students Say"
 * carousel). Same fail-safe shape as lib/db/team-members.ts: the
 * table arrives via migration 20261113T1640_success_stories_management;
 * until Eman runs it, reads return empty/null and writes return a
 * clear error.
 *
 * NOTE: this is NOT the per-course `Review` model (a student rating
 * tied to a User + Course) — StudentReview is a standalone,
 * admin-managed carousel card.
 */
import { getDb } from './client';
import { mapStudentReviewRow, stripUndefined } from './mappers';
import type { StudentReview, StudentReviewRow } from './types';

export function isMissingStudentReviewTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';
  if (code === '42P01' && text.includes('StudentReview')) return true;
  return /relation .* does not exist/i.test(text) && text.includes('StudentReview');
}

async function withStudentReviewTableFallback<T>(fetch: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fetch();
  } catch (error) {
    if (isMissingStudentReviewTableError(error)) return fallback;
    throw error;
  }
}

export const STUDENT_REVIEW_TABLES_MISSING_MESSAGE =
  'Student review table is not set up yet — run codebettle-success-stories-mgmt-migration.sql in the Supabase SQL Editor first.';

function throwIfTablesMissing(error: unknown): never {
  if (isMissingStudentReviewTableError(error)) {
    throw new Error(STUDENT_REVIEW_TABLES_MISSING_MESSAGE);
  }
  throw error;
}

export async function areStudentReviewTablesReady(): Promise<boolean> {
  try {
    await getDb().orm.public.StudentReview.orderBy((r) => r.createdAt.desc()).limit(1).all();
    return true;
  } catch (error) {
    if (isMissingStudentReviewTableError(error)) return false;
    throw error;
  }
}

export interface CreateStudentReviewInput {
  fullName: string;
  role: string;
  photoUrl?: string | null;
  rating: number;
  reviewText: string;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
  order?: number;
  enabled?: boolean;
}

export async function createStudentReview(input: CreateStudentReviewInput): Promise<StudentReview> {
  try {
    const row = await getDb().orm.public.StudentReview.create({
      fullName: input.fullName,
      role: input.role,
      photoUrl: input.photoUrl ?? null,
      rating: input.rating,
      reviewText: input.reviewText,
      linkedinUrl: input.linkedinUrl ?? null,
      githubUrl: input.githubUrl ?? null,
      websiteUrl: input.websiteUrl ?? null,
      order: input.order ?? 0,
      enabled: input.enabled ?? true,
    });
    return mapStudentReviewRow(row as StudentReviewRow);
  } catch (error) {
    throwIfTablesMissing(error);
  }
}

export async function getStudentReviewById(id: string): Promise<StudentReview | null> {
  return withStudentReviewTableFallback(async () => {
    const row = await getDb().orm.public.StudentReview.where({ id }).first();
    return row ? mapStudentReviewRow(row as StudentReviewRow) : null;
  }, null);
}

/** Admin list: every review, carousel order. */
export async function listStudentReviews(): Promise<StudentReview[]> {
  return withStudentReviewTableFallback(async () => {
    const rows = await getDb()
      .orm.public.StudentReview.orderBy((r) => r.order.asc())
      .orderBy((r) => r.createdAt.asc())
      .all();
    return rows.map((r) => mapStudentReviewRow(r as StudentReviewRow));
  }, []);
}

/** Public list (home carousel): enabled reviews only, carousel order. */
export async function listEnabledStudentReviews(): Promise<StudentReview[]> {
  const all = await listStudentReviews();
  return all.filter((r) => r.enabled);
}

export interface UpdateStudentReviewInput {
  fullName?: string;
  role?: string;
  photoUrl?: string | null;
  rating?: number;
  reviewText?: string;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
  order?: number;
  enabled?: boolean;
}

export async function updateStudentReview(
  id: string,
  input: UpdateStudentReviewInput,
): Promise<StudentReview | null> {
  try {
    const updated = await getDb()
      .orm.public.StudentReview.where({ id })
      .update(stripUndefined({ ...input }));
    if (!updated) return null;
    return getStudentReviewById(id);
  } catch (error) {
    throwIfTablesMissing(error);
  }
}

export async function deleteStudentReview(id: string): Promise<boolean> {
  try {
    const deleted = await getDb().orm.public.StudentReview.where({ id }).delete();
    return deleted !== null;
  } catch (error) {
    throwIfTablesMissing(error);
  }
}
