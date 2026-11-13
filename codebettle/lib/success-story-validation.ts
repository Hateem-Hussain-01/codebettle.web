/**
 * Shared validation for success story submissions.
 *
 * Pure, client-safe module: no server imports, so the multi-step form
 * (client) and the submit API route (server) enforce the SAME rules.
 * The server never trusts the client — the API route re-runs every
 * check in this module on the received payload, and re-validates every
 * referenced storage file (type + size + existence) server-side.
 *
 * Limits:
 * - Profile picture: JPG / JPEG / PNG / WebP, max 5 MB.
 * - Evidence files: images, PDF, Word/Excel/PowerPoint, plain text —
 *   max 10 MB each. No executables, scripts, HTML or archives.
 * - Video testimonial: MP4 / WebM / MOV, max 100 MB. Uploaded directly
 *   to Storage through a signed URL (the Vercel serverless request
 *   cap is ~4.5 MB, so a video must never travel through the API route).
 */

import { isSuccessStoryCategory } from './success-story-categories';

/** Maximum lengths — keeps a submission bounded and the admin UI sane. */
export const SUCCESS_STORY_LIMITS = {
  fullName: 120,
  email: 254,
  country: 80,
  city: 80,
  designation: 120,
  url: 500,
  courseTitle: 200,
  instructorName: 120,
  skillsLearned: 2000,
  experience: 5000,
  story: 8000,
  beforeJoining: 4000,
  challenges: 4000,
  howHelped: 4000,
  achievementsAfter: 4000,
  biggestAchievement: 2000,
  advice: 4000,
  videoDescription: 1000,
  achievementTitle: 200,
  achievementOrganization: 200,
  achievementDescription: 4000,
  evidenceLabel: 200,
  adminNote: 2000,
} as const;

export const MAX_PROFILE_PICTURE_BYTES = 5 * 1024 * 1024;
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export const PROFILE_PICTURE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const EVIDENCE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
] as const;
export const VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

const PROFILE_PICTURE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const EVIDENCE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
};
const VIDEO_EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export function extensionForMime(mime: string, kind: 'profile' | 'evidence' | 'video'): string | null {
  const map =
    kind === 'profile' ? PROFILE_PICTURE_EXTENSIONS : kind === 'evidence' ? EVIDENCE_EXTENSIONS : VIDEO_EXTENSIONS;
  return map[mime] ?? null;
}

/** Lowercase extension of a filename (no dot), or ''. */
export function fileExtensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot + 1).toLowerCase();
}

/** Strict http(s) URL check (no javascript:, no relative URLs, host required). */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Extract a YouTube video id from a watch / shorts / live / youtu.be URL (null when not a YouTube URL). Used by the public page to embed the testimonial video. */
export function youtubeVideoId(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = url.pathname.replace(/^\//, '').split('/')[0];
    return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    const id = url.searchParams.get('v');
    if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) return id;
    const parts = url.pathname.split('/').filter(Boolean);
    if ((parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'embed') && parts[1]) {
      return /^[A-Za-z0-9_-]{6,}$/.test(parts[1]) ? parts[1] : null;
    }
  }
  return null;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || typeof value === 'string';
}

function checkLength(value: string, max: number, field: string, errors: string[]): void {
  if (value.length > max) errors.push(`${field} must be ${max} characters or fewer`);
}

function checkOptionalUrl(value: unknown, field: string, errors: string[]): void {
  if (value === null || value === undefined || value === '') return;
  if (typeof value !== 'string' || !isHttpUrl(value)) {
    errors.push(`${field} must be a valid URL starting with http:// or https://`);
    return;
  }
  checkLength(value, SUCCESS_STORY_LIMITS.url, field, errors);
}

// ---------------------------------------------------------------------------
// Payload shapes (what the submit API accepts — JSON, not multipart;
// files are uploaded first through signed URLs and referenced by path).
// ---------------------------------------------------------------------------

export interface SuccessStoryEvidenceInput {
  kind: 'file' | 'link';
  /** Storage path for a file (e.g. `evidence/<uuid>.pdf`), URL for a link. */
  url: string;
  label?: string | null;
  fileName?: string | null;
  mime?: string | null;
  size?: number | null;
}

export interface SuccessStoryAchievementInput {
  category: string;
  title: string;
  organization?: string | null;
  description?: string | null;
  achievedAt?: string | null;
  evidence?: SuccessStoryEvidenceInput[];
}

export interface SuccessStorySubmitInput {
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
  joinedAt?: string | null;
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
  consentContact?: boolean;
  achievements?: SuccessStoryAchievementInput[];
  idempotencyKey: string;
}

/**
 * Validate a submission payload. Returns a list of human-readable
 * errors (empty = valid). Used by the client before submit AND by the
 * server on every request — the server never trusts the client.
 */
export function validateSuccessStorySubmit(input: unknown): string[] {
  const errors: string[] = [];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return ['Invalid submission data'];
  }
  const v = input as Record<string, unknown>;

  // Step 1 — personal information.
  if (!isNonEmptyString(v.fullName)) errors.push('Full name is required');
  else checkLength(v.fullName, SUCCESS_STORY_LIMITS.fullName, 'Full name', errors);
  if (!isNonEmptyString(v.email)) errors.push('Email address is required');
  else if (!isValidEmail(v.email)) errors.push('Email address is not valid');
  if (!isNonEmptyString(v.profilePicturePath)) {
    errors.push('Profile picture is required');
  } else if (typeof v.profilePicturePath !== 'string' || !v.profilePicturePath.startsWith('profiles/')) {
    errors.push('Profile picture reference is not valid');
  }
  if (!isNonEmptyString(v.country)) errors.push('Country is required');
  else checkLength(v.country, SUCCESS_STORY_LIMITS.country, 'Country', errors);
  if (isNonEmptyString(v.city)) checkLength(v.city, SUCCESS_STORY_LIMITS.city, 'City', errors);
  if (isNonEmptyString(v.designation)) checkLength(v.designation, SUCCESS_STORY_LIMITS.designation, 'Designation', errors);
  checkOptionalUrl(v.linkedinUrl, 'LinkedIn profile URL', errors);

  // Step 2 — learning experience.
  if (!isNonEmptyString(v.courseTitle)) errors.push('Course is required');
  else checkLength(v.courseTitle, SUCCESS_STORY_LIMITS.courseTitle, 'Course', errors);
  if (v.batchNumber !== null && v.batchNumber !== undefined) {
    if (typeof v.batchNumber !== 'number' || !Number.isInteger(v.batchNumber) || v.batchNumber < 1) {
      errors.push('Batch number must be a positive whole number');
    }
  } else if (v.batchId !== null && v.batchId !== undefined && v.batchId !== '') {
    // A batch id without a number is a client bug — reject it.
    errors.push('Batch number is required');
  }
  if (v.batchId !== null && v.batchId !== undefined && v.batchId !== '' && typeof v.batchId !== 'string') {
    errors.push('Batch selection is not valid');
  }
  if (isNonEmptyString(v.joinedAt) && Number.isNaN(Date.parse(v.joinedAt))) {
    errors.push('Join date is not a valid date');
  }
  if (isNonEmptyString(v.instructorName)) checkLength(v.instructorName, SUCCESS_STORY_LIMITS.instructorName, 'Instructor name', errors);
  if (!isNonEmptyString(v.skillsLearned)) errors.push('Skills learned is required');
  else checkLength(v.skillsLearned, SUCCESS_STORY_LIMITS.skillsLearned, 'Skills learned', errors);
  if (!isNonEmptyString(v.experience)) errors.push('Learning experience description is required');
  else checkLength(v.experience, SUCCESS_STORY_LIMITS.experience, 'Learning experience', errors);

  // Step 3 — the story (main story mandatory).
  if (!isNonEmptyString(v.story)) errors.push('Your success story is required');
  else checkLength(v.story, SUCCESS_STORY_LIMITS.story, 'Success story', errors);
  for (const [field, label, max] of [
    ['beforeJoining', 'Before joining CodeBettle', SUCCESS_STORY_LIMITS.beforeJoining],
    ['challenges', 'Challenges', SUCCESS_STORY_LIMITS.challenges],
    ['howHelped', 'How CodeBettle helped', SUCCESS_STORY_LIMITS.howHelped],
    ['achievementsAfter', 'Achievements after joining', SUCCESS_STORY_LIMITS.achievementsAfter],
    ['biggestAchievement', 'Biggest achievement', SUCCESS_STORY_LIMITS.biggestAchievement],
    ['advice', 'Advice for other learners', SUCCESS_STORY_LIMITS.advice],
  ] as const) {
    if (isNonEmptyString(v[field])) checkLength(v[field] as string, max, label, errors);
  }

  // Step 4 — achievements.
  if (v.achievements !== undefined && v.achievements !== null) {
    if (!Array.isArray(v.achievements)) {
      errors.push('Achievements are not valid');
    } else {
      if (v.achievements.length > 20) errors.push('You can add at most 20 achievements');
      v.achievements.forEach((a, i) => {
        const prefix = `Achievement ${i + 1}`;
        if (a === null || typeof a !== 'object' || Array.isArray(a)) {
          errors.push(`${prefix} is not valid`);
          return;
        }
        const ach = a as Record<string, unknown>;
        if (!isSuccessStoryCategory(ach.category)) errors.push(`${prefix}: please choose a category`);
        if (!isNonEmptyString(ach.title)) errors.push(`${prefix}: title is required`);
        else checkLength(ach.title, SUCCESS_STORY_LIMITS.achievementTitle, `${prefix} title`, errors);
        if (isNonEmptyString(ach.organization)) checkLength(ach.organization, SUCCESS_STORY_LIMITS.achievementOrganization, `${prefix} organization`, errors);
        if (isNonEmptyString(ach.description)) checkLength(ach.description, SUCCESS_STORY_LIMITS.achievementDescription, `${prefix} description`, errors);
        if (isNonEmptyString(ach.achievedAt) && Number.isNaN(Date.parse(ach.achievedAt))) {
          errors.push(`${prefix}: date is not valid`);
        }
        if (ach.evidence !== undefined && ach.evidence !== null) {
          if (!Array.isArray(ach.evidence)) {
            errors.push(`${prefix}: supporting evidence is not valid`);
          } else {
            if (ach.evidence.length > 10) errors.push(`${prefix}: at most 10 supporting items per achievement`);
            ach.evidence.forEach((e, j) => {
              const ePrefix = `${prefix}, evidence ${j + 1}`;
              if (e === null || typeof e !== 'object' || Array.isArray(e)) {
                errors.push(`${ePrefix} is not valid`);
                return;
              }
              const ev = e as Record<string, unknown>;
              if (ev.kind !== 'file' && ev.kind !== 'link') {
                errors.push(`${ePrefix}: kind must be "file" or "link"`);
                return;
              }
              if (!isNonEmptyString(ev.url)) {
                errors.push(`${ePrefix}: a file or link is required`);
                return;
              }
              if (ev.kind === 'link' && !isHttpUrl(ev.url as string)) {
                errors.push(`${ePrefix}: link must be a valid URL starting with http:// or https://`);
              }
              if (ev.kind === 'file' && !(ev.url as string).startsWith('evidence/')) {
                errors.push(`${ePrefix}: file reference is not valid`);
              }
              if (isNonEmptyString(ev.label)) checkLength(ev.label as string, SUCCESS_STORY_LIMITS.evidenceLabel, `${ePrefix} label`, errors);
              if (typeof ev.size === 'number' && (!Number.isFinite(ev.size) || ev.size < 0)) {
                errors.push(`${ePrefix}: file size is not valid`);
              }
            });
          }
        }
      });
    }
  }

  // Step 5 — social profiles (all optional, URL-validated).
  for (const [field, label] of [
    ['githubUrl', 'GitHub profile URL'],
    ['instagramUrl', 'Instagram profile URL'],
    ['youtubeUrl', 'YouTube channel URL'],
    ['portfolioUrl', 'Personal portfolio URL'],
    ['lablabUrl', 'LabLab.ai profile URL'],
    ['leetcodeUrl', 'LeetCode profile URL'],
    ['hackerrankUrl', 'HackerRank profile URL'],
    ['otherProfileUrl', 'Other profile URL'],
  ] as const) {
    checkOptionalUrl(v[field], label, errors);
  }

  // Step 6 — video testimonial (optional).
  if (isNonEmptyString(v.videoUrl) && !isHttpUrl(v.videoUrl)) {
    errors.push('YouTube video link must be a valid URL starting with http:// or https://');
  }
  if (isNonEmptyString(v.videoPath) && !v.videoPath.startsWith('videos/')) {
    errors.push('Video reference is not valid');
  }
  if (isNonEmptyString(v.videoDescription)) checkLength(v.videoDescription, SUCCESS_STORY_LIMITS.videoDescription, 'Video description', errors);

  // Step 7 — consent (publication / media / accuracy are required).
  if (v.consentPublication !== true) errors.push('Publication permission is required');
  if (v.consentMedia !== true) errors.push('Media usage permission is required');
  if (v.consentAccuracy !== true) errors.push('Information accuracy confirmation is required');
  if (v.consentContact !== undefined && typeof v.consentContact !== 'boolean') {
    errors.push('Contact permission is not valid');
  }

  // Idempotency key (client-generated UUID for the form session).
  if (!isNonEmptyString(v.idempotencyKey)) errors.push('Submission reference is missing — please reload the form and try again');
  else if ((v.idempotencyKey as string).length > 100) errors.push('Submission reference is not valid');

  // Optional strings must actually be strings when present.
  for (const field of ['city', 'designation', 'courseId', 'joinedAt', 'instructorName'] as const) {
    if (!isOptionalString(v[field])) errors.push(`${field} is not valid`);
  }

  return errors;
}

/** Per-step validation for the multi-step form (client-side, step by step). */
export function validateSuccessStoryStep(step: number, input: unknown): string[] {
  const all = validateSuccessStorySubmit(input);
  // Map errors to steps by their message prefix / field.
  const stepMatchers: Record<number, RegExp[]> = {
    1: [/Full name/, /Email address/, /Profile picture/, /Country/, /City/, /Designation/, /LinkedIn profile URL/],
    2: [/Course/, /Batch/, /Join date/, /Instructor name/, /Skills learned/, /Learning experience/],
    3: [/Success story/, /Before joining/, /Challenges/, /How CodeBettle helped/, /Achievements after/, /Biggest achievement/, /Advice for other learners/],
    4: [/Achievement/],
    5: [/GitHub/, /Instagram/, /YouTube channel/, /Personal portfolio/, /LabLab/, /LeetCode/, /HackerRank/, /Other profile URL/],
    6: [/YouTube video link/, /Video reference/, /Video description/],
    7: [/Publication permission/, /Media usage permission/, /Information accuracy/, /Contact permission/, /Submission reference/],
  };
  const matchers = stepMatchers[step] ?? [];
  return all.filter((e) => matchers.some((re) => re.test(e)));
}
