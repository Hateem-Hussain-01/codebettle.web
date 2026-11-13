/**
 * Success story service — submission flow, review workflow, public view.
 *
 * Business rules:
 * - Submission numbers are `SS-YYYY-XXXX` (sequential per year, unique
 *   constraint + retry on conflict).
 * - Idempotency: the client sends one idempotencyKey per form session.
 *   Re-submitting the same key returns the original submission instead
 *   of creating a duplicate (safe double-click / retry).
 * - Duplicate guard: a pending / under-review story for the same email +
 *   course within 24 hours is rejected as an accidental re-submission.
 *   A rejected story never blocks a fresh submission.
 * - Files are verified server-side before the submission is created:
 *   every referenced storage path must exist, with a matching MIME and
 *   a size inside the limit. A client-supplied path is never trusted.
 * - Public view: only approved stories, only publication-safe fields
 *   (no email, no idempotency key, no admin note, no reviewer fields,
 *   no private evidence file paths).
 */
import {
  countSuccessStorySubmissionsInYear,
  createSuccessStorySubmission,
  deleteSuccessStorySubmission,
  findRecentDuplicateSubmission,
  getSuccessStorySubmissionById,
  getSuccessStorySubmissionByIdempotencyKey,
  listApprovedSuccessStories,
  listSuccessStorySubmissions,
  updateSuccessStorySubmission,
  type ListSuccessStorySubmissionsFilter,
  type UpdateSuccessStorySubmissionInput,
} from '../db/success-stories';
import { getSuccessStoryPublicUrl, verifySuccessStoryFile, bucketForSuccessStoryPath, deleteSuccessStoryFile, SUCCESS_STORIES_BUCKET } from './success-story-storage';
import { APPLICATION_FILES_BUCKET } from './application-storage';
import {
  EVIDENCE_MIMES,
  MAX_EVIDENCE_BYTES,
  MAX_PROFILE_PICTURE_BYTES,
  MAX_VIDEO_BYTES,
  PROFILE_PICTURE_MIMES,
  VIDEO_MIMES,
  validateSuccessStorySubmit,
  type SuccessStorySubmitInput,
} from '../success-story-validation';
import type { PublicSuccessStory, SuccessStoryStatus, SuccessStorySubmission } from '../db/types';
import { SUCCESS_STORY_CATEGORY_VALUES } from '../success-story-categories';

export type SubmitSuccessStoryResult =
  | { ok: true; submission: SuccessStorySubmission; duplicate: boolean }
  | { ok: false; error: string; status: number };

function publicUrlOrUndefined(path: string | undefined): string | undefined {
  if (!path) return undefined;
  try {
    return getSuccessStoryPublicUrl(path);
  } catch {
    return undefined;
  }
}

/** Next submission number: SS-YYYY-XXXX, sequential per year. */
export async function nextSubmissionNumber(now: Date = new Date()): Promise<string> {
  const year = now.getFullYear();
  const count = await countSuccessStorySubmissionsInYear(year);
  return `SS-${year}-${String(count + 1).padStart(4, '0')}`;
}

/** Create a submission number, retrying on a unique-constraint race (up to 5 attempts). */
async function allocateSubmissionNumber(now: Date = new Date()): Promise<string> {
  const year = now.getFullYear();
  const base = await countSuccessStorySubmissionsInYear(year);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `SS-${year}-${String(base + 1 + attempt).padStart(4, '0')}`;
    const existing = await import('../db/success-stories').then((m) =>
      m.getSuccessStorySubmissionByNumber(candidate),
    );
    if (!existing) return candidate;
  }
  return `SS-${year}-${String(base + 1).padStart(4, '0')}-${Date.now().toString(36)}`;
}

interface FileCheck {
  bucket: string;
  path: string;
  mimes: readonly string[];
  maxBytes: number;
  label: string;
}

async function verifyReferencedFiles(input: SuccessStorySubmitInput): Promise<string | null> {
  const checks: FileCheck[] = [
    {
      bucket: SUCCESS_STORIES_BUCKET,
      path: input.profilePicturePath as string,
      mimes: PROFILE_PICTURE_MIMES,
      maxBytes: MAX_PROFILE_PICTURE_BYTES,
      label: 'Profile picture',
    },
  ];
  if (input.videoPath) {
    checks.push({
      bucket: SUCCESS_STORIES_BUCKET,
      path: input.videoPath,
      mimes: VIDEO_MIMES,
      maxBytes: MAX_VIDEO_BYTES,
      label: 'Video testimonial',
    });
  }
  for (const ach of input.achievements ?? []) {
    for (const ev of ach.evidence ?? []) {
      if (ev.kind === 'file') {
        checks.push({
          bucket: APPLICATION_FILES_BUCKET,
          path: ev.url,
          mimes: EVIDENCE_MIMES,
          maxBytes: MAX_EVIDENCE_BYTES,
          label: `Supporting evidence (${ev.fileName ?? 'file'})`,
        });
      }
    }
  }
  for (const check of checks) {
    const bucket = bucketForSuccessStoryPath(check.path) ?? check.bucket;
    const info = await verifySuccessStoryFile(bucket, check.path);
    if (!info.exists) return `${check.label} could not be found — please upload it again`;
    if (info.mime && !check.mimes.includes(info.mime)) {
      return `${check.label} has an unsupported file type`;
    }
    if (info.size !== undefined && info.size > check.maxBytes) {
      return `${check.label} is larger than the allowed size`;
    }
  }
  return null;
}

function buildCreateInput(
  input: SuccessStorySubmitInput,
  submitterId: string | null,
  submissionNumber: string,
): Parameters<typeof createSuccessStorySubmission>[0] {
  return {
    submissionNumber,
    submitterId,
    fullName: input.fullName.trim(),
    email: input.email.trim().toLowerCase(),
    profilePicturePath: input.profilePicturePath ?? null,
    country: input.country.trim(),
    city: input.city?.trim() || null,
    designation: input.designation?.trim() || null,
    linkedinUrl: input.linkedinUrl?.trim() || null,
    courseId: input.courseId || null,
    courseTitle: input.courseTitle.trim(),
    batchId: input.batchId || null,
    batchNumber: input.batchNumber ?? null,
    joinedAt: input.joinedAt ? new Date(input.joinedAt) : null,
    instructorName: input.instructorName?.trim() || null,
    skillsLearned: input.skillsLearned.trim(),
    experience: input.experience.trim(),
    story: input.story.trim(),
    beforeJoining: input.beforeJoining?.trim() || null,
    challenges: input.challenges?.trim() || null,
    howHelped: input.howHelped?.trim() || null,
    achievementsAfter: input.achievementsAfter?.trim() || null,
    biggestAchievement: input.biggestAchievement?.trim() || null,
    advice: input.advice?.trim() || null,
    githubUrl: input.githubUrl?.trim() || null,
    instagramUrl: input.instagramUrl?.trim() || null,
    youtubeUrl: input.youtubeUrl?.trim() || null,
    portfolioUrl: input.portfolioUrl?.trim() || null,
    lablabUrl: input.lablabUrl?.trim() || null,
    leetcodeUrl: input.leetcodeUrl?.trim() || null,
    hackerrankUrl: input.hackerrankUrl?.trim() || null,
    otherProfileUrl: input.otherProfileUrl?.trim() || null,
    videoPath: input.videoPath || null,
    videoUrl: input.videoUrl?.trim() || null,
    videoDescription: input.videoDescription?.trim() || null,
    consentPublication: input.consentPublication,
    consentMedia: input.consentMedia,
    consentAccuracy: input.consentAccuracy,
    consentContact: input.consentContact ?? false,
    idempotencyKey: input.idempotencyKey,
    achievements: (input.achievements ?? []).map((a) => ({
      category: a.category,
      title: a.title.trim(),
      organization: a.organization?.trim() || null,
      description: a.description?.trim() || null,
      achievedAt: a.achievedAt || null,
      evidence: (a.evidence ?? []).map((e) => ({
        kind: e.kind,
        label: e.label?.trim() || null,
        url: e.url,
        fileName: e.fileName || null,
        mime: e.mime || null,
        size: e.size ?? null,
      })),
    })),
  };
}

/**
 * Submit a story. `submitterId` is the logged-in student's id when
 * logged in, null for a guest submission.
 */
export async function submitSuccessStory(
  input: SuccessStorySubmitInput,
  submitterId: string | null,
): Promise<SubmitSuccessStoryResult> {
  const errors = validateSuccessStorySubmit(input);
  if (errors.length > 0) return { ok: false, error: errors[0], status: 400 };

  // Idempotency: same key -> return the original submission.
  const existing = await getSuccessStorySubmissionByIdempotencyKey(input.idempotencyKey);
  if (existing) return { ok: true, submission: existing, duplicate: true };

  // Accidental re-submission guard (same email + course, still in review).
  const dup = await findRecentDuplicateSubmission(input.email, input.courseTitle);
  if (dup) {
    return {
      ok: false,
      error: `A story from ${input.email} for ${input.courseTitle} is already under review (submission ${dup.submissionNumber}). Please wait for the review before submitting again.`,
      status: 409,
    };
  }

  const fileError = await verifyReferencedFiles(input);
  if (fileError) return { ok: false, error: fileError, status: 400 };

  const submissionNumber = await allocateSubmissionNumber();
  try {
    const submission = await createSuccessStorySubmission(
      buildCreateInput(input, submitterId, submissionNumber),
    );
    return { ok: true, submission, duplicate: false };
  } catch (error) {
    // A unique-constraint race on the submission number: retry once
    // with a fresh number instead of failing the student.
    const message = error instanceof Error ? error.message : '';
    if (/unique|duplicate/i.test(message)) {
      try {
        const retryNumber = await allocateSubmissionNumber();
        const submission = await createSuccessStorySubmission(
          buildCreateInput(input, submitterId, retryNumber),
        );
        return { ok: true, submission, duplicate: false };
      } catch {
        return { ok: false, error: 'Your story could not be saved. Please try again.', status: 500 };
      }
    }
    if (/Success story tables are not set up/i.test(message)) {
      return { ok: false, error: message, status: 503 };
    }
    return { ok: false, error: 'Your story could not be saved. Please try again.', status: 500 };
  }
}

/** Build the public view of one approved story (publication-safe fields only). */
export function toPublicSuccessStory(s: SuccessStorySubmission): PublicSuccessStory {
  return {
    id: s.id,
    submissionNumber: s.submissionNumber,
    fullName: s.fullName,
    profilePictureUrl: publicUrlOrUndefined(s.profilePicturePath),
    country: s.country,
    city: s.city,
    designation: s.designation,
    linkedinUrl: s.linkedinUrl,
    courseTitle: s.courseTitle,
    batchNumber: s.batchNumber,
    joinedAt: s.joinedAt,
    instructorName: s.instructorName,
    skillsLearned: s.skillsLearned,
    experience: s.experience,
    story: s.story,
    beforeJoining: s.beforeJoining,
    challenges: s.challenges,
    howHelped: s.howHelped,
    achievementsAfter: s.achievementsAfter,
    biggestAchievement: s.biggestAchievement,
    advice: s.advice,
    githubUrl: s.githubUrl,
    instagramUrl: s.instagramUrl,
    youtubeUrl: s.youtubeUrl,
    portfolioUrl: s.portfolioUrl,
    lablabUrl: s.lablabUrl,
    leetcodeUrl: s.leetcodeUrl,
    hackerrankUrl: s.hackerrankUrl,
    otherProfileUrl: s.otherProfileUrl,
    videoUrl: s.videoUrl,
    videoPlaybackUrl: publicUrlOrUndefined(s.videoPath),
    videoDescription: s.videoDescription,
    featured: s.featured,
    submittedAt: s.submittedAt,
    // Distinct achievement categories, in the canonical category order
    // (there is no separate categories column — achievements carry them).
    categories: SUCCESS_STORY_CATEGORY_VALUES.filter((c) =>
      s.achievements.some((a) => a.category === c),
    ) as string[],
    achievements: s.achievements.map((a) => ({
      id: a.id,
      category: a.category,
      title: a.title,
      organization: a.organization,
      description: a.description,
      achievedAt: a.achievedAt,
      links: a.evidence.filter((e) => e.kind === 'link').map((e) => ({ label: e.label, url: e.url })),
    })),
  };
}

/** Public list: approved stories only, featured first. */
export async function listPublicSuccessStories(): Promise<PublicSuccessStory[]> {
  const approved = await listApprovedSuccessStories();
  return approved.map(toPublicSuccessStory);
}

export async function getPublicSuccessStory(id: string): Promise<PublicSuccessStory | null> {
  const s = await getSuccessStorySubmissionById(id);
  if (!s || s.status !== 'approved' || !s.enabled) return null;
  return toPublicSuccessStory(s);
}

/**
 * Admin-created story (PR #32, Success Stories Management): an admin
 * adds a story directly — same publication fields as a submission,
 * marked adminCreated and created already approved. No submitter
 * consent is involved (the admin is publishing on the student's
 * behalf with their permission); the admin's email is recorded as
 * the contact email. Minimal required fields only — the rest default
 * to empty, like a submission with only the required steps filled.
 */
export interface AdminCreateStoryInput {
  fullName: string;
  email: string;
  country: string;
  city?: string | null;
  designation?: string | null;
  courseTitle: string;
  batchNumber?: number | null;
  skillsLearned: string;
  experience: string;
  story: string;
  profilePicturePath?: string | null;
  linkedinUrl?: string | null;
  videoPath?: string | null;
  videoUrl?: string | null;
  featured?: boolean;
}

export async function createAdminSuccessStory(
  input: AdminCreateStoryInput,
): Promise<SuccessStorySubmission> {
  const submissionNumber = await allocateSubmissionNumber();
  const created = await createSuccessStorySubmission({
    submissionNumber,
    submitterId: null,
    fullName: input.fullName.trim(),
    email: input.email.trim().toLowerCase(),
    profilePicturePath: input.profilePicturePath ?? null,
    country: input.country.trim(),
    city: input.city?.trim() || null,
    designation: input.designation?.trim() || null,
    linkedinUrl: input.linkedinUrl?.trim() || null,
    courseId: null,
    courseTitle: input.courseTitle.trim(),
    batchId: null,
    batchNumber: input.batchNumber ?? null,
    joinedAt: null,
    instructorName: null,
    skillsLearned: input.skillsLearned.trim(),
    experience: input.experience.trim(),
    story: input.story.trim(),
    beforeJoining: null,
    challenges: null,
    howHelped: null,
    achievementsAfter: null,
    biggestAchievement: null,
    advice: null,
    githubUrl: null,
    instagramUrl: null,
    youtubeUrl: null,
    portfolioUrl: null,
    lablabUrl: null,
    leetcodeUrl: null,
    hackerrankUrl: null,
    otherProfileUrl: null,
    videoPath: input.videoPath || null,
    videoUrl: input.videoUrl?.trim() || null,
    videoDescription: null,
    consentPublication: true,
    consentMedia: true,
    consentAccuracy: true,
    consentContact: false,
    idempotencyKey: `admin-${submissionNumber}`,
    achievements: [],
    status: 'approved',
    adminCreated: true,
    enabled: true,
    displayOrder: 0,
    featured: input.featured ?? false,
  });
  return created;
}

export async function listAdminSuccessStories(
  filter: ListSuccessStorySubmissionsFilter = {},
): Promise<{ items: SuccessStorySubmission[]; total: number }> {
  const result = await listSuccessStorySubmissions(filter);
  // The list rows carry only the storage path; attach the public URL so
  // the admin list shows each student's profile picture (the detail
  // view gets it via adminStoryMediaUrls instead).
  return {
    total: result.total,
    items: result.items.map((s) => ({
      ...s,
      profilePictureUrl: publicUrlOrUndefined(s.profilePicturePath),
    })),
  };
}

export async function getAdminSuccessStory(id: string): Promise<SuccessStorySubmission | null> {
  return getSuccessStorySubmissionById(id);
}

export interface ReviewSuccessStoryInput {
  status: SuccessStoryStatus;
  featured?: boolean;
  adminNote?: string | null;
  reviewedBy: string;
}

export async function reviewSuccessStory(
  id: string,
  input: ReviewSuccessStoryInput,
): Promise<SuccessStorySubmission | null> {
  const current = await getSuccessStorySubmissionById(id);
  if (!current) return null;
  const update: UpdateSuccessStorySubmissionInput = {
    status: input.status,
    reviewedBy: input.reviewedBy,
  };
  if (input.featured !== undefined) update.featured = input.featured;
  if (input.adminNote !== undefined) update.adminNote = input.adminNote;
  return updateSuccessStorySubmission(id, update);
}

/** Admin edit of story fields before publication. */
export async function editSuccessStoryDetails(
  id: string,
  input: Omit<UpdateSuccessStorySubmissionInput, 'status' | 'featured' | 'adminNote' | 'reviewedBy'>,
): Promise<SuccessStorySubmission | null> {
  return updateSuccessStorySubmission(id, input);
}

/** Delete a submission and its stored files (profile picture, video, evidence). */
export async function deleteSuccessStory(id: string): Promise<boolean> {
  const current = await getSuccessStorySubmissionById(id);
  if (!current) return false;
  const deleted = await deleteSuccessStorySubmission(id);
  if (!deleted) return false;
  const paths: { bucket: string; path: string }[] = [];
  if (current.profilePicturePath) paths.push({ bucket: SUCCESS_STORIES_BUCKET, path: current.profilePicturePath });
  if (current.videoPath) paths.push({ bucket: SUCCESS_STORIES_BUCKET, path: current.videoPath });
  for (const a of current.achievements) {
    for (const e of a.evidence) {
      if (e.kind === 'file') paths.push({ bucket: APPLICATION_FILES_BUCKET, path: e.url });
    }
  }
  await Promise.all(paths.map((p) => deleteSuccessStoryFile(p.bucket, p.path)));
  return true;
}

/** Public URLs for one admin-viewed submission (picture + video). */
export function adminStoryMediaUrls(s: SuccessStorySubmission): { profilePictureUrl?: string; videoPlaybackUrl?: string } {
  return {
    profilePictureUrl: publicUrlOrUndefined(s.profilePicturePath),
    videoPlaybackUrl: publicUrlOrUndefined(s.videoPath),
  };
}
