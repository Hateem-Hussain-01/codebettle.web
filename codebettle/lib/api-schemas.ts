/**
 * Shared zod schemas for the Phase 3 write APIs (lib/api-schemas.ts).
 *
 * The admin and instructor course routes validate the same shapes, so the
 * schemas live here once instead of drifting between two route files.
 * Routes still own the auth gate and the service call; these only shape
 * the request body. Instructor routes accept status/instructorId in the
 * update schema on purpose — the service rejects those changes with 403
 * instead of silently dropping them.
 */
import { z } from 'zod';
import { isValidSocialUrl } from './social';

export const courseCategories = [
  'Web Development',
  'Mobile Development',
  'Data Science',
  'UI/UX Design',
  'DevOps',
  'Programming',
] as const;
export const courseLevels = ['beginner', 'intermediate', 'advanced'] as const;
export const courseStatuses = ['draft', 'published', 'archived'] as const;

/**
 * A thumbnail URL must be an absolute http(s) URL — no relative paths,
 * no javascript:/data: URLs, nothing unparseable. Mirrors
 * isValidThumbnailUrl in lib/thumbnail.ts (the client-side check); the
 * schema is the server-side enforcement for PATCH.
 *
 * NOTE: applied to the UPDATE schema only. The CREATE schema keeps the
 * plain min(1) string because existing route tests create courses with
 * the test-only relative path '/t.png' (tests/admin-write-apis.test.ts)
 * — the create form enforces the http(s) rule client-side instead (its
 * thumbnail can only come from the storage upload, which returns an
 * https URL). Do not tighten the create schema without updating those
 * tests first.
 */
export const httpUrlSchema = z.string().refine(
  (value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  },
  { message: 'Must be a valid http(s) URL' },
);

export const scheduleSchema = z.object({
  classTime: z.string().min(1),
  classDuration: z.string(),
  scheduleType: z.enum(['weekdays', 'weekends', 'whole-week', 'custom']),
  customDays: z.array(z.string()).optional(),
  startDate: z.string().min(1),
  notes: z.string().optional(),
});

export const courseCreateSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  longDescription: z.string().min(1),
  thumbnail: z.string().min(1),
  category: z.enum(courseCategories),
  level: z.enum(courseLevels),
  price: z.number().int().min(0),
  isFree: z.boolean().optional(),
  instructorId: z.string().min(1).optional(),
  zoomLink: z.string().optional(),
  schedule: scheduleSchema.optional(),
  requirements: z.array(z.string()).optional(),
  whatYouLearn: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  /** Optional full HTML certificate template for this course. Absent = the default Python design. */
  certificateTemplateHtml: z.string().optional(),
  /** Optional public course outline PDF URL. Absent = no outline attached. */
  outlineUrl: httpUrlSchema.optional(),
});

export const courseUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  longDescription: z.string().optional(),
  thumbnail: httpUrlSchema.optional(),
  category: z.enum(courseCategories).optional(),
  level: z.enum(courseLevels).optional(),
  price: z.number().int().min(0).optional(),
  isFree: z.boolean().optional(),
  instructorId: z.string().min(1).optional(),
  zoomLink: z.string().nullable().optional(),
  schedule: scheduleSchema.nullable().optional(),
  status: z.enum(courseStatuses).optional(),
  isFeatured: z.boolean().optional(),
  isCompleted: z.boolean().optional(),
  requirements: z.array(z.string()).optional(),
  whatYouLearn: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  /** Full HTML certificate template for this course; null clears an attached template. */
  certificateTemplateHtml: z.string().nullable().optional(),
  /** Public course outline PDF URL; null clears an attached outline. */
  outlineUrl: httpUrlSchema.nullable().optional(),
});

export const courseStatusSchema = z.object({
  status: z.enum(courseStatuses),
});

export const moduleCreateSchema = z.object({
  title: z.string().min(1),
});

export const moduleUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  position: z.number().int().min(1).optional(),
});

const materialSchema = z.object({ name: z.string(), url: z.string() });

export const lessonCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  recordingUrl: z.string().optional(),
  materials: z.array(materialSchema).optional(),
  duration: z.string().optional(),
  date: z.string().optional(),
});

export const lessonUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  recordingUrl: z.string().nullable().optional(),
  materials: z.array(materialSchema).optional(),
  duration: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  position: z.number().int().min(1).optional(),
});

export const enrollmentCreateSchema = z.object({
  studentId: z.string().min(1),
  courseId: z.string().min(1),
  batchId: z.string().min(1).optional(),
  // Phase 2 (paid-with-no-proof fix): an admin creating an enrolment
  // directly may NOT set it to 'paid' — a brand-new enrolment cannot
  // have a linked approved payment submission yet. 'paid' is only
  // reachable through the payment verification flow (approve a submitted
  // payment, or PATCH with an approved submission). Create as 'pending'
  // and verify the payment, or 'free' for free courses.
  paymentStatus: z.enum(['free', 'pending']),
  amountPaid: z.number().int().min(0),
  couponUsed: z.string().optional(),
});

export const enrollmentUpdateSchema = z.object({
  isCompleted: z.boolean().optional(),
  completedAt: z.string().optional(),
  paymentStatus: z.enum(['paid', 'free', 'pending']).optional(),
  amountPaid: z.number().int().min(0).optional(),
  certificateEligible: z.boolean().optional(),
  batchId: z.string().min(1).nullable().optional(),
});

export const batchCreateSchema = z.object({
  courseId: z.string().min(1),
  batchNumber: z.number().int().min(1).optional(),
  status: z.enum(['upcoming', 'ongoing', 'completed']).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  capacity: z.number().int().min(1).nullable().optional(),
  instructorId: z.string().min(1).nullable().optional(),
});

export const batchUpdateSchema = z.object({
  status: z.enum(['upcoming', 'ongoing', 'completed']).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  capacity: z.number().int().min(1).nullable().optional(),
  instructorId: z.string().min(1).nullable().optional(),
});

/**
 * Module 3 (Phase 2): LinkedIn, CV, demo recording and whyGoodFit are
 * REQUIRED — the become-instructor form requires them and the service
 * enforces the same set. expertise/experience/message stay optional
 * here on purpose: the form UI marks them required (HTML required +
 * disabled-until-valid), but the server tolerates their absence — a
 * committed test pins message as optional in this schema, and older
 * direct callers submit without them. additionalInfo and phone are
 * optional end to end.
 */
export const applicationCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  expertise: z.string().optional(),
  experience: z.string().optional(),
  message: z.string().optional(),
  additionalInfo: z.string().optional(),
  whyGoodFit: z.string().min(1),
  cvUrl: z.string().min(1),
  linkedinUrl: z.string().url().min(1),
  githubUrl: z.string().url().optional(),
  demoRecordingUrl: z.string().min(1),
});

export const applicationReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

// ---------------------------------------------------------------------------
// Recruitment pipeline — Modules 19/20/21 (Phase 2)
// ---------------------------------------------------------------------------

/** Admin-managed pipeline stage (create/update). */
export const applicationStageSchema = z.object({
  name: z.string().min(1).max(100),
  instructions: z.string().max(1000).nullable().optional(),
});

/** Reorder the pipeline: the full stage id list in the new order. */
export const applicationStageReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

/** Move an application to a pipeline stage. */
export const applicationAssignStageSchema = z.object({
  stageId: z.string().min(1),
  note: z.string().max(500).optional(),
});

/** Ask the applicant for more information (note is the message). */
export const applicationRequestInfoSchema = z.object({
  note: z.string().min(1).max(1000),
});

/** Internal admin note — always stored internal, never shown to applicants. */
export const applicationNoteSchema = z.object({
  body: z.string().min(1).max(2000),
});

/** Admin-assisted view-as: mint a token for one teacher's portal. */
export const viewAsSchema = z.object({
  teacherId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Payments (Phase 1b/1c)
// ---------------------------------------------------------------------------

export const paymentSubmissionSchema = z.object({
  enrollmentId: z.string().min(1),
  paymentAccountId: z.string().min(1).optional(),
  amountPkr: z.number().int().positive(),
  transactionRef: z.string().min(1).max(100),
  /** Storage path returned by POST /api/student/payments/upload. */
  proofPath: z.string().min(1).optional(),
});

export const paymentReviewSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reviewNote: z.string().max(500).optional(),
});

export const certificateCreateSchema = z.object({
  studentId: z.string().min(1),
  courseId: z.string().min(1),
  enrollmentId: z.string().min(1),
  certificateNumber: z.string().min(1).optional(),
  /** Cohort batch printed on the certificate (e.g. "BATCH-8"). Optional. */
  batch: z.string().max(50).optional(),
});

export const blogCreateSchema = z
  .object({
    slug: z.string().min(1),
    title: z.string().min(1),
    excerpt: z.string().min(1),
    content: z.string(),
    pdfUrl: z.string().optional(),
    thumbnail: z.string().min(1),
    category: z.string().min(1),
    authorName: z.string().optional(),
    publishedAt: z.string().optional(),
    isPublished: z.boolean().optional(),
    readTime: z.string().min(1),
    tags: z.array(z.string()).optional(),
  })
  .refine((d) => d.content.trim() !== '' || (d.pdfUrl ?? '').trim() !== '', {
    message: 'Add article content or upload a PDF',
  });

export const blogUpdateSchema = z.object({
  slug: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  excerpt: z.string().optional(),
  content: z.string().optional(),
  pdfUrl: z.string().nullable().optional(),
  thumbnail: z.string().optional(),
  category: z.string().optional(),
  authorName: z.string().optional(),
  publishedAt: z.string().nullable().optional(),
  isPublished: z.boolean().optional(),
  readTime: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const userUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  expertise: z.array(z.string()).optional(),
  socialLinks: z
    .object({
      github: z.string().optional(),
      linkedin: z.string().optional(),
      twitter: z.string().optional(),
      website: z.string().optional(),
    })
    .nullable()
    .optional(),
  role: z.enum(['student', 'instructor']).optional(),
});

// ---------------------------------------------------------------------------
// Quiz (Phase 5)
// ---------------------------------------------------------------------------

export const quizQuestionTypes = ['mcq', 'fill_blank', 'checkbox', 'choose_two', 'choose_three'] as const;
export const quizStatuses = ['draft', 'published', 'archived'] as const;

export const quizCreateSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  topics: z.array(z.string()).optional(),
  difficulty: z.enum(courseLevels).optional(),
  timeLimitMin: z.number().int().positive().optional(),
  attemptsAllowed: z.number().int().min(1).optional(),
  passMark: z.number().int().min(0).max(100).optional(),
  scoringPolicy: z.enum(['exact', 'partial']).optional(),
  showResultsToStudents: z.boolean().optional(),
  showCorrectAnswers: z.boolean().optional(),
  availableFrom: z.string().nullable().optional(),
  availableUntil: z.string().nullable().optional(),
  instructions: z.string().optional(),
});

export const quizUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  topics: z.array(z.string()).optional(),
  difficulty: z.enum(courseLevels).nullable().optional(),
  timeLimitMin: z.number().int().positive().nullable().optional(),
  attemptsAllowed: z.number().int().min(1).optional(),
  passMark: z.number().int().min(0).max(100).nullable().optional(),
  scoringPolicy: z.enum(['exact', 'partial']).optional(),
  showResultsToStudents: z.boolean().optional(),
  showCorrectAnswers: z.boolean().optional(),
  availableFrom: z.string().nullable().optional(),
  availableUntil: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
  action: z.enum(['publish', 'unpublish', 'archive']).optional(),
});

export const quizQuestionSchema = z.object({
  type: z.enum(quizQuestionTypes),
  prompt: z.string().min(1),
  points: z.number().int().min(1),
  topic: z.string().optional(),
  difficulty: z.enum(courseLevels).optional(),
  correctText: z.string().optional(),
  acceptedAnswers: z.array(z.string()).optional(),
  explanation: z.string().optional(),
  options: z
    .array(z.object({ text: z.string().min(1), isCorrect: z.boolean().optional() }))
    .optional()
    .default([]),
});

export const quizQuestionsSchema = z.object({
  questions: z.array(quizQuestionSchema),
});

export const quizTextImportSchema = z.object({
  text: z.string().min(1).max(200_000),
});

export const quizSubmitSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      selectedOptionIds: z.array(z.string()).optional().default([]),
      textAnswer: z.string().optional(),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Payment accounts (Phase 1e, Module 16)
// ---------------------------------------------------------------------------

export const paymentMethods = ['bank', 'easypaisa', 'jazzcash', 'wallet', 'other'] as const;

/**
 * Receiving-account details (bank / Easypaisa / JazzCash / wallet) that
 * students pay into. These are account numbers and holder names, not
 * secrets — but writes are admin-only (managePaymentAccounts).
 * At least one of accountNumber / iban / walletNumber must be present.
 */
const paymentAccountRefPresent = (d: {
  accountNumber?: string | null;
  iban?: string | null;
  walletNumber?: string | null;
}): boolean =>
  [d.accountNumber, d.iban, d.walletNumber].some((v) => (v ?? '').trim() !== '');

export const paymentAccountCreateSchema = z
  .object({
    label: z.string().min(1),
    method: z.enum(paymentMethods),
    accountHolder: z.string().min(1),
    bankName: z.string().optional(),
    accountNumber: z.string().optional(),
    iban: z.string().optional(),
    walletNumber: z.string().optional(),
    instructions: z.string().optional(),
    isActive: z.boolean().optional(),
    displayOrder: z.number().int().optional(),
  })
  .refine(paymentAccountRefPresent, {
    message: 'Provide an account number, IBAN or wallet number',
  });

export const paymentAccountUpdateSchema = z.object({
  label: z.string().min(1).optional(),
  method: z.enum(paymentMethods).optional(),
  accountHolder: z.string().min(1).optional(),
  bankName: z.string().nullable().optional(),
  accountNumber: z.string().nullable().optional(),
  iban: z.string().nullable().optional(),
  walletNumber: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
});

// ---------------------------------------------------------------------------
// Footer social links (Phase 4, Module 7)
// ---------------------------------------------------------------------------

/**
 * An admin-managed footer social icon. ONLY two things are required:
 * Icon Name (e.g. LinkedIn) and Icon Link (the profile URL). The icon
 * itself is auto-fetched from the name — no image upload. URLs must be
 * http(s) or mailto: (see isValidSocialUrl in lib/social.ts).
 */
const socialLinkUrlSchema = z
  .string()
  .refine(isValidSocialUrl, {
    message: 'Icon link must be a valid https:// URL or a mailto: address',
  });

export const socialLinkCreateSchema = z.object({
  name: z.string().min(1),
  url: socialLinkUrlSchema,
  displayOrder: z.number().int().optional(),
  isEnabled: z.boolean().optional(),
});

export const socialLinkUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  url: socialLinkUrlSchema.optional(),
  displayOrder: z.number().int().optional(),
  isEnabled: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Site settings (Admin Settings persistence fix)
// ---------------------------------------------------------------------------

/**
 * Partial update of the six site-wide settings on the Admin Settings
 * page. Every field is optional — PATCH accepts any subset — but a
 * field that IS present must be a non-empty string (and a valid email
 * for contactEmail). Rejects unknown-shape input at the route, before
 * the service ever sees it.
 */
export const settingsUpdateSchema = z.object({
  siteName: z.string().min(1).optional(),
  siteDescription: z.string().min(1).optional(),
  contactEmail: z.string().email().optional(),
  phone: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  maintenanceMode: z.boolean().optional(),
  // Rich text (HTML from the RichTextEditor), empty allowed: empty means
  // "no custom text stored" and the Success Stories page shows its
  // placeholder. Sanitized + blank-normalized by the service on save.
  ceoMessage: z.string().optional(),
  visionText: z.string().optional(),
  // Public image URL for the CEO photo; empty allowed (falls back to
  // the default photo). Validated as an http(s) URL by the service.
  ceoPhotoUrl: z.string().optional(),
});
