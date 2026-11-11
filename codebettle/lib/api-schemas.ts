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
});

export const courseUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  longDescription: z.string().optional(),
  thumbnail: z.string().optional(),
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
});

export const applicationCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().min(1),
  phone: z.string().optional(),
  expertise: z.string().optional(),
  experience: z.string().optional(),
  message: z.string().optional(),
  cvUrl: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
  githubUrl: z.string().url().optional(),
  demoRecordingUrl: z.string().optional(),
});

export const applicationReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
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

export const quizReviewQuestionSchema = z.object({
  type: z.enum(quizQuestionTypes),
  prompt: z.string().min(1),
  points: z.number().int().min(1),
  topic: z.string().optional(),
  difficulty: z.enum(courseLevels).optional(),
  correctText: z.string().optional(),
  acceptedAnswers: z.array(z.string()).optional(),
  needsReview: z.boolean().optional(),
  reviewNote: z.string().optional(),
  options: z
    .array(z.object({ text: z.string().min(1), isCorrect: z.boolean().optional() }))
    .optional()
    .default([]),
});

export const quizReviewSchema = z.object({
  questions: z.array(quizReviewQuestionSchema),
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
