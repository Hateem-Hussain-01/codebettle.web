/**
 * Success story submission repository.
 *
 * FAIL-SAFE (same shape as the batch repository in lib/db/batches.ts):
 * the tables arrive via migration 20261113T1442_add_success_story_submissions,
 * which Eman runs himself in the Supabase SQL Editor. Until it runs, the
 * live DB has no SuccessStorySubmission table — reads catch the
 * "relation does not exist" error and return empty/null (the public page
 * and the admin section show a "run the SQL" state), and writes return a
 * clear error telling the caller to run the migration SQL first. Nothing
 * else breaks.
 *
 * Privacy: the repository returns full rows (the admin flow needs them);
 * the PUBLIC shape is built by lib/services/success-story-service.ts
 * (toPublicSuccessStory) and is the only shape the public API returns.
 */
import { getDb } from './client';
import {
  mapSuccessStorySubmissionRow,
  stripUndefined,
} from './mappers';
import type {
  SuccessStoryAchievementRow,
  SuccessStoryEvidenceRow,
  SuccessStoryStatus,
  SuccessStorySubmission,
  SuccessStorySubmissionRow,
} from './types';
import type { SuccessStoryAchievementInput, SuccessStoryEvidenceInput } from '../success-story-validation';

/** True when the error is "relation does not exist" for a success-story table (migration not run yet). */
export function isMissingSuccessStoryTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  const text = typeof message === 'string' ? message : '';
  const namesStory =
    text.includes('SuccessStorySubmission') ||
    text.includes('SuccessStoryAchievement') ||
    text.includes('SuccessStoryEvidence');
  if (code === '42P01' && namesStory) return true;
  return /relation .* does not exist/i.test(text) && namesStory;
}

/** A read that returns the fallback when the tables are missing, instead of throwing. */
async function withSuccessStoryTableFallback<T>(fetch: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fetch();
  } catch (error) {
    if (isMissingSuccessStoryTableError(error)) return fallback;
    throw error;
  }
}

export const SUCCESS_STORY_TABLES_MISSING_MESSAGE =
  'Success story tables are not set up yet — run codebettle-success-story-migration.sql in the Supabase SQL Editor first.';

/** Cheap probe: true when the tables exist (migration has run). Used by the public page + admin section to show a "run the SQL" state instead of an empty list. */
export async function areSuccessStoryTablesReady(): Promise<boolean> {
  try {
    await getDb()
      .orm.public.SuccessStorySubmission.orderBy((s) => s.submittedAt.desc())
      .limit(1)
      .all();
    return true;
  } catch (error) {
    if (isMissingSuccessStoryTableError(error)) return false;
    throw error;
  }
}

function throwIfTablesMissing(error: unknown): never {
  if (isMissingSuccessStoryTableError(error)) {
    throw new Error(SUCCESS_STORY_TABLES_MISSING_MESSAGE);
  }
  throw error;
}

async function loadAchievements(
  submissionIds: string[],
): Promise<Map<string, { achievement: SuccessStoryAchievementRow; evidence: SuccessStoryEvidenceRow[] }[]>> {
  const out = new Map<string, { achievement: SuccessStoryAchievementRow; evidence: SuccessStoryEvidenceRow[] }[]>();
  if (submissionIds.length === 0) return out;
  const achievementRows = await getDb()
    .orm.public.SuccessStoryAchievement.where((a) => a.submissionId.in(submissionIds))
    .orderBy((a) => a.createdAt.asc())
    .all();
  const achievementIds = achievementRows.map((r) => r.id);
  const evidenceRows =
    achievementIds.length > 0
      ? await getDb()
          .orm.public.SuccessStoryEvidence.where((e) => e.achievementId.in(achievementIds))
          .orderBy((e) => e.createdAt.asc())
          .all()
      : [];
  const evidenceByAchievement = new Map<string, SuccessStoryEvidenceRow[]>();
  for (const e of evidenceRows) {
    const list = evidenceByAchievement.get(e.achievementId) ?? [];
    list.push(e);
    evidenceByAchievement.set(e.achievementId, list);
  }
  for (const a of achievementRows) {
    const list = out.get(a.submissionId) ?? [];
    list.push({ achievement: a, evidence: evidenceByAchievement.get(a.id) ?? [] });
    out.set(a.submissionId, list);
  }
  return out;
}

function toSubmission(row: SuccessStorySubmissionRow, achievements: Map<string, { achievement: SuccessStoryAchievementRow; evidence: SuccessStoryEvidenceRow[] }[]>): SuccessStorySubmission {
  return mapSuccessStorySubmissionRow(row, achievements.get(row.id) ?? []);
}

export interface CreateSuccessStorySubmissionInput {
  submissionNumber: string;
  submitterId?: string | null;
  fullName: string;
  email: string;
  profilePicturePath?: string | null;
  country: string;
  city?: string | null;
  designation?: string | null;
  linkedinUrl?: string | null;
  courseId?: string | null;
  courseTitle: string;
  batchId?: string | null;
  batchNumber?: number | null;
  joinedAt?: Date | null;
  instructorName?: string | null;
  skillsLearned: string;
  experience: string;
  story: string;
  beforeJoining?: string | null;
  challenges?: string | null;
  howHelped?: string | null;
  achievementsAfter?: string | null;
  biggestAchievement?: string | null;
  advice?: string | null;
  githubUrl?: string | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
  portfolioUrl?: string | null;
  lablabUrl?: string | null;
  leetcodeUrl?: string | null;
  hackerrankUrl?: string | null;
  otherProfileUrl?: string | null;
  videoPath?: string | null;
  videoUrl?: string | null;
  videoDescription?: string | null;
  consentPublication: boolean;
  consentMedia: boolean;
  consentAccuracy: boolean;
  consentContact: boolean;
  idempotencyKey: string;
  achievements: (SuccessStoryAchievementInput & { evidence: SuccessStoryEvidenceInput[] })[];
  // PR #32 — admin-created stories: created already approved, marked
  // adminCreated, with an explicit display order. Student submissions
  // omit these (pending, not admin-created, order 0).
  status?: SuccessStoryStatus;
  adminCreated?: boolean;
  enabled?: boolean;
  displayOrder?: number;
  featured?: boolean;
}

/** Create a submission + its achievements + evidence (validated before this call). */
export async function createSuccessStorySubmission(
  input: CreateSuccessStorySubmissionInput,
): Promise<SuccessStorySubmission> {
  try {
    // Every field is a value or `?? null` — no undefined values, so no
    // stripUndefined wrapper is needed (its Partial<T> return type does
    // not satisfy the create input type).
    const row = await getDb().orm.public.SuccessStorySubmission.create({
      submissionNumber: input.submissionNumber,
      submitterId: input.submitterId ?? null,
      fullName: input.fullName,
      email: input.email,
      profilePicturePath: input.profilePicturePath ?? null,
      country: input.country,
      city: input.city ?? null,
      designation: input.designation ?? null,
      linkedinUrl: input.linkedinUrl ?? null,
      courseId: input.courseId ?? null,
      courseTitle: input.courseTitle,
      batchId: input.batchId ?? null,
      batchNumber: input.batchNumber ?? null,
      joinedAt: input.joinedAt ?? null,
      instructorName: input.instructorName ?? null,
      skillsLearned: input.skillsLearned,
      experience: input.experience,
      story: input.story,
      beforeJoining: input.beforeJoining ?? null,
      challenges: input.challenges ?? null,
      howHelped: input.howHelped ?? null,
      achievementsAfter: input.achievementsAfter ?? null,
      biggestAchievement: input.biggestAchievement ?? null,
      advice: input.advice ?? null,
      githubUrl: input.githubUrl ?? null,
      instagramUrl: input.instagramUrl ?? null,
      youtubeUrl: input.youtubeUrl ?? null,
      portfolioUrl: input.portfolioUrl ?? null,
      lablabUrl: input.lablabUrl ?? null,
      leetcodeUrl: input.leetcodeUrl ?? null,
      hackerrankUrl: input.hackerrankUrl ?? null,
      otherProfileUrl: input.otherProfileUrl ?? null,
      videoPath: input.videoPath ?? null,
      videoUrl: input.videoUrl ?? null,
      videoDescription: input.videoDescription ?? null,
      consentPublication: input.consentPublication,
      consentMedia: input.consentMedia,
      consentAccuracy: input.consentAccuracy,
      consentContact: input.consentContact,
      // Explicit (not DB defaults): the in-memory test fake does not
      // apply Prisma column defaults, and explicit values keep the
      // created row identical everywhere.
      status: input.status ?? 'pending',
      featured: input.featured ?? false,
      enabled: input.enabled ?? true,
      displayOrder: input.displayOrder ?? 0,
      adminCreated: input.adminCreated ?? false,
      idempotencyKey: input.idempotencyKey,
    });
    for (const ach of input.achievements) {
      const achRow = await getDb().orm.public.SuccessStoryAchievement.create({
        submissionId: row.id,
        category: ach.category,
        title: ach.title,
        organization: ach.organization ?? null,
        description: ach.description ?? null,
        achievedAt: ach.achievedAt ? new Date(ach.achievedAt) : null,
      });
      for (const ev of ach.evidence) {
        await getDb().orm.public.SuccessStoryEvidence.create({
          achievementId: achRow.id,
          kind: ev.kind,
          label: ev.label ?? null,
          url: ev.url,
          fileName: ev.fileName ?? null,
          mime: ev.mime ?? null,
          size: ev.size ?? null,
        });
      }
    }
    const loaded = await getSuccessStorySubmissionById(row.id);
    if (!loaded) throw new Error('Success story submission could not be read back after creation');
    return loaded;
  } catch (error) {
    throwIfTablesMissing(error);
  }
}

export async function getSuccessStorySubmissionById(id: string): Promise<SuccessStorySubmission | null> {
  return withSuccessStoryTableFallback(async () => {
    const row = await getDb().orm.public.SuccessStorySubmission.where({ id }).first();
    if (!row) return null;
    const achievements = await loadAchievements([row.id]);
    return toSubmission(row, achievements);
  }, null);
}

export async function getSuccessStorySubmissionByNumber(
  submissionNumber: string,
): Promise<SuccessStorySubmission | null> {
  return withSuccessStoryTableFallback(async () => {
    const row = await getDb().orm.public.SuccessStorySubmission.where({ submissionNumber }).first();
    if (!row) return null;
    const achievements = await loadAchievements([row.id]);
    return toSubmission(row, achievements);
  }, null);
}

export async function getSuccessStorySubmissionByIdempotencyKey(
  idempotencyKey: string,
): Promise<SuccessStorySubmission | null> {
  return withSuccessStoryTableFallback(async () => {
    const row = await getDb().orm.public.SuccessStorySubmission.where({ idempotencyKey }).first();
    if (!row) return null;
    const achievements = await loadAchievements([row.id]);
    return toSubmission(row, achievements);
  }, null);
}

export interface ListSuccessStorySubmissionsFilter {
  status?: SuccessStoryStatus;
  featured?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

/** Admin list (all statuses). Pass no filter for everything, newest first. */
export async function listSuccessStorySubmissions(
  filter: ListSuccessStorySubmissionsFilter = {},
): Promise<{ items: SuccessStorySubmission[]; total: number }> {
  return withSuccessStoryTableFallback(async () => {
    let rows = await getDb()
      .orm.public.SuccessStorySubmission.orderBy((s) => s.submittedAt.desc())
      .all();
    if (filter.status) rows = rows.filter((r) => r.status === filter.status);
    if (filter.featured !== undefined) rows = rows.filter((r) => r.featured === filter.featured);
    if (filter.search) {
      const q = filter.search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.submissionNumber.toLowerCase().includes(q) ||
          r.courseTitle.toLowerCase().includes(q),
      );
    }
    const total = rows.length;
    const page = rows.slice(filter.offset ?? 0, (filter.offset ?? 0) + (filter.limit ?? 50));
    const achievements = await loadAchievements(page.map((r) => r.id));
    return { items: page.map((r) => toSubmission(r, achievements)), total };
  }, { items: [], total: 0 });
}

/** Public list: approved AND enabled stories only, featured first, then display order, then newest. */
export async function listApprovedSuccessStories(): Promise<SuccessStorySubmission[]> {
  return withSuccessStoryTableFallback(async () => {
    const rows = await getDb()
      .orm.public.SuccessStorySubmission.where((s) => s.status.eq('approved'))
      .orderBy((s) => s.submittedAt.desc())
      .all();
    const achievements = await loadAchievements(rows.map((r) => r.id));
    const mapped = rows.map((r) => toSubmission(r, achievements));
    // `enabled` is filtered here (not in the query): rows written
    // before the PR #32 migration have no enabled value yet, and the
    // mapper defaults those to true — a query-level `enabled = true`
    // would hide them.
    return mapped
      .filter((s) => s.enabled)
      .sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) ||
          a.displayOrder - b.displayOrder ||
          b.submittedAt.localeCompare(a.submittedAt),
      );
  }, []);
}

/** Count of submissions in a calendar year (for the SS-YYYY-XXXX number). */
export async function countSuccessStorySubmissionsInYear(year: number): Promise<number> {
  return withSuccessStoryTableFallback(async () => {
    const rows = await getDb().orm.public.SuccessStorySubmission.all();
    return rows.filter((r) => r.submittedAt.getFullYear() === year).length;
  }, 0);
}

/**
 * Recent non-rejected submission by the same email + course (duplicate
 * guard): a pending / under-review story for the same course within the
 * last 24 hours blocks an accidental re-submission. Rejected stories
 * never block a fresh submission.
 */
export async function findRecentDuplicateSubmission(
  email: string,
  courseTitle: string,
  withinMs: number = 24 * 60 * 60 * 1000,
): Promise<SuccessStorySubmission | null> {
  return withSuccessStoryTableFallback(async () => {
    const rows = await getDb()
      .orm.public.SuccessStorySubmission.where((s) => s.email.eq(email.toLowerCase()))
      .orderBy((s) => s.submittedAt.desc())
      .all();
    const cutoff = Date.now() - withinMs;
    const dup = rows.find(
      (r) =>
        r.courseTitle.toLowerCase() === courseTitle.toLowerCase() &&
        (r.status === 'pending' || r.status === 'under_review') &&
        r.submittedAt.getTime() >= cutoff,
    );
    if (!dup) return null;
    const achievements = await loadAchievements([dup.id]);
    return toSubmission(dup, achievements);
  }, null);
}

export interface UpdateSuccessStorySubmissionInput {
  status?: SuccessStoryStatus;
  featured?: boolean;
  enabled?: boolean;
  displayOrder?: number;
  adminNote?: string | null;
  reviewedBy?: string | null;
  // Admin edit before publication (story fields only — never the
  // submitter's identity or consent flags).
  fullName?: string;
  country?: string;
  city?: string | null;
  designation?: string | null;
  courseTitle?: string;
  batchNumber?: number | null;
  skillsLearned?: string;
  experience?: string;
  story?: string;
  beforeJoining?: string | null;
  challenges?: string | null;
  howHelped?: string | null;
  achievementsAfter?: string | null;
  biggestAchievement?: string | null;
  advice?: string | null;
}

/** Update a submission (status change, featured flag, admin edit). */
export async function updateSuccessStorySubmission(
  id: string,
  input: UpdateSuccessStorySubmissionInput,
): Promise<SuccessStorySubmission | null> {
  try {
    const data: Record<string, unknown> = stripUndefined({
      status: input.status,
      featured: input.featured,
      enabled: input.enabled,
      displayOrder: input.displayOrder,
      adminNote: input.adminNote,
      reviewedBy: input.reviewedBy,
      fullName: input.fullName,
      country: input.country,
      city: input.city,
      designation: input.designation,
      courseTitle: input.courseTitle,
      batchNumber: input.batchNumber,
      skillsLearned: input.skillsLearned,
      experience: input.experience,
      story: input.story,
      beforeJoining: input.beforeJoining,
      challenges: input.challenges,
      howHelped: input.howHelped,
      achievementsAfter: input.achievementsAfter,
      biggestAchievement: input.biggestAchievement,
      advice: input.advice,
    });
    if (input.status === 'approved' || input.status === 'rejected' || input.status === 'under_review') {
      data.reviewedAt = new Date();
    }
    const updated = await getDb().orm.public.SuccessStorySubmission.where({ id }).update(data);
    if (!updated) return null;
    return getSuccessStorySubmissionById(id);
  } catch (error) {
    throwIfTablesMissing(error);
  }
}

/** Delete a submission and its achievements + evidence (FK cascade). */
export async function deleteSuccessStorySubmission(id: string): Promise<boolean> {
  try {
    const deleted = await getDb().orm.public.SuccessStorySubmission.where({ id }).delete();
    return deleted !== null;
  } catch (error) {
    throwIfTablesMissing(error);
  }
}

/** Replace one achievement's evidence rows (admin edit path). */
export async function replaceAchievementEvidence(
  achievementId: string,
  evidence: SuccessStoryEvidenceInput[],
): Promise<void> {
  try {
    await getDb().orm.public.SuccessStoryEvidence.where({ achievementId }).deleteAll();
    for (const ev of evidence) {
      await getDb().orm.public.SuccessStoryEvidence.create({
        achievementId,
        kind: ev.kind,
        label: ev.label ?? null,
        url: ev.url,
        fileName: ev.fileName ?? null,
        mime: ev.mime ?? null,
        size: ev.size ?? null,
      });
    }
  } catch (error) {
    throwIfTablesMissing(error);
  }
}
