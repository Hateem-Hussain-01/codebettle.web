/**
 * Domain types (Phase 2).
 *
 * These are the shapes the application works with — deliberately the same
 * shapes the old lib/data/*.ts interfaces used, so pages change minimally
 * (import path + await). The Prisma contract uses different storage shapes
 * (pricePkr, Web_Development, timestamptz, nested tables); the mapping
 * lives in lib/db/mappers.ts and the repositories.
 *
 * Row types (Db*Row) are scalar-only picks of the generated contract
 * models — the shapes a plain Prisma query returns (no relations loaded).
 */
import type { Models } from '../../src/prisma/contract.d';
import type { AdminPermissions } from '../admin-access';

export type { AdminPermissions } from '../admin-access';

export type UserRole = 'student' | 'instructor' | 'admin';
export type UserStatus = 'active' | 'suspended';
export type CourseLevel = 'beginner' | 'intermediate' | 'advanced';
export type CourseStatus = 'draft' | 'published' | 'archived';
export type CourseCategory =
  | 'Web Development'
  | 'Mobile Development'
  | 'Data Science'
  | 'UI/UX Design'
  | 'DevOps'
  | 'Programming';
export type ScheduleType = 'weekdays' | 'weekends' | 'whole-week' | 'custom';
export type EnrollmentPaymentStatus = 'paid' | 'free' | 'pending';
export type CouponType = 'percentage' | 'fixed';
export type AnnouncementType = 'site-wide' | 'course';
export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface SocialLinks {
  github?: string;
  linkedin?: string;
  twitter?: string;
  website?: string;
}

/**
 * Notification preferences (Phase 4). Stored as a nullable Json column
 * (`User.notificationPrefs`); NULL means the defaults below. Declared as
 * a `type` (not an `interface`) on purpose: Prisma's JsonValue requires
 * an index signature, which interfaces do not carry implicitly — as a
 * type alias this shape is assignable to JsonValue, so repositories can
 * store it in the Json column (same reason as CourseSchedule).
 *
 * The `email` flag is informational only until Resend exists — the email
 * hook never attempts delivery while no provider is configured.
 */
export type NotificationEventKey =
  | 'enrollment'
  | 'completion'
  | 'certificate'
  | 'application'
  | 'announcement'
  | 'support_request'
  | 'request_update'
  | 'form_submission';

export type NotificationPrefs = {
  inApp: boolean;
  email: boolean;
  events: {
    enrollment: boolean;
    completion: boolean;
    certificate: boolean;
    application: boolean;
    announcement: boolean;
    support_request: boolean;
    request_update: boolean;
    form_submission: boolean;
  };
};

export const NOTIFICATION_EVENT_KEYS: readonly NotificationEventKey[] = [
  'enrollment',
  'completion',
  'certificate',
  'application',
  'announcement',
  'support_request',
  'request_update',
  'form_submission',
] as const;

/** Defaults applied when the stored prefs are NULL (or a field is missing). */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  inApp: true,
  email: false,
  events: {
    enrollment: true,
    completion: true,
    certificate: true,
    application: true,
    announcement: true,
    support_request: true,
    request_update: true,
    form_submission: true,
  },
};

/**
 * Notification category (Phase 3). Stored as a String on the
 * Notification row, like `type` — no Prisma enum, matching the
 * codebase pattern. IMPORTANT / SPECIAL NOTICE bypass the per-event
 * prefs toggle (see lib/services/notification-service.ts): they must
 * reach everyone, otherwise the acknowledge gate is meaningless.
 */
export type NotificationCategory = 'general' | 'important' | 'warning' | 'special_notice';

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  'general',
  'important',
  'warning',
  'special_notice',
] as const;

/** Categories that bypass the per-event notification-prefs toggle. */
export const PREFS_BYPASS_CATEGORIES: readonly NotificationCategory[] = [
  'important',
  'special_notice',
] as const;

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  general: 'General',
  important: 'Important',
  warning: 'Warning',
  special_notice: 'Special notice',
};

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  /**
   * Phase 2 flags (multi-role). `role` is the PRIMARY role (home portal);
   * these flags are additional capabilities: isAdmin => admin capability,
   * isTeacher => teacher capability, both may be true at once. A plain
   * student is role 'student' with both false. See contract.prisma and
   * lib/rbac.ts for the full semantics; guards must use
   * hasAdminCapability / hasTeacherCapability, never `role ===` alone.
   */
  isAdmin: boolean;
  isTeacher: boolean;
  avatar?: string;
  bio?: string;
  phone?: string;
  expertise?: string[];
  socialLinks?: SocialLinks;
  /** Null in the DB (or absent) means defaults: inApp on, email off, all events on. */
  notificationPrefs?: NotificationPrefs;
  /**
   * Per-area admin permissions (Item G). Stored as a nullable Json column
   * (`User.adminPermissions`); NULL / undefined means a FULL admin — every
   * area granted, including future areas. A map grants only the areas set
   * to `true`. Only meaningful when role is `admin`.
   */
  adminPermissions?: AdminPermissions;
  /**
   * Phase 5 (Module 23): explicit grant to view the audit log,
   * separate from adminPermissions. Default false; never seeded true.
   * The two official administrators always have audit-log access,
   * with or without this flag (see lib/super-admin.ts).
   */
  canViewAuditLog: boolean;
  status: UserStatus;
  joinedAt: string;
  /** Course ids the student is enrolled in. Populated by list/getStudents and getUserByIdWithEnrollments; undefined otherwise. */
  enrolledCourses?: string[];
  /** Populated from the Wishlist table (Phase 0/1); [] when the student has none. */
  wishlist?: string[];
}

/** A user with the password hash removed — the only shape pages and API responses may carry. */
export type SafeUser = Omit<User, 'passwordHash'>;

/**
 * A course schedule. Declared as a `type` (not an `interface`) on purpose:
 * Prisma's JsonValue requires an index signature, which interfaces do not
 * carry implicitly — as a type alias this shape is assignable to JsonValue,
 * so repositories can store it in the Course.schedule Json column.
 */
export type CourseSchedule = {
  classTime: string;
  classDuration: string;
  scheduleType: ScheduleType;
  customDays?: string[];
  startDate: string;
  notes?: string;
};

export interface Lesson {
  id: string;
  title: string;
  description: string;
  /** Date of the live class session ('' when not set). */
  date: string;
  driveRecordingUrl: string;
  materials: { name: string; url: string }[];
  duration: string;
}

export interface Module {
  id: string;
  title: string;
  lessons: Lesson[];
}

export interface Course {
  id: string;
  slug: string;
  title: string;
  description: string;
  longDescription: string;
  thumbnail: string;
  category: CourseCategory;
  level: CourseLevel;
  price: number;
  isFree: boolean;
  instructorId: string;
  zoomLink: string;
  schedule?: CourseSchedule;
  status: CourseStatus;
  isFeatured: boolean;
  isCompleted: boolean;
  completedAt?: string;
  modules: Module[];
  requirements: string[];
  whatYouLearn: string[];
  tags: string[];
  enrolledCount: number;
  rating: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * The public course shape: everything a visitor may see, minus the Zoom
 * link. Zoom links are for enrolled students only (see the student course
 * page) — the public catalogue API, the public course pages and every
 * client component they feed must use this shape, never the full Course.
 * Admin and instructor surfaces keep the full shape (they are behind
 * auth and need the link to run the class).
 */
export type PublicCourse = Omit<Course, 'zoomLink'>;

export interface Enrollment {
  id: string;
  studentId: string;
  courseId: string;
  enrolledAt: string;
  completedLessons: string[];
  isCompleted: boolean;
  completedAt?: string;
  paymentStatus: EnrollmentPaymentStatus;
  couponUsed?: string;
  amountPaid: number;
  certificateEligible?: boolean;
}

export interface Certificate {
  id: string;
  studentId: string;
  courseId: string;
  enrollmentId: string;
  issuedAt: string;
  certificateNumber: string;
  verificationToken: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  maxUses: number;
  usedCount: number;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
  applicableCourses?: string[];
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: AnnouncementType;
  courseId?: string;
  authorId: string;
  createdAt: string;
  isActive: boolean;
}

export interface Review {
  id: string;
  studentId: string;
  courseId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

/**
 * A message sent through the public contact form (Phase 7). The model
 * already existed in the Prisma contract (migration 1) but nothing ever
 * wrote to it — the form faked the send. Messages are admin-only to
 * read; there is no public listing.
 */
export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject?: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface Testimonial {
  id: string;
  studentName: string;
  studentAvatar: string;
  courseTitle: string;
  rating: number;
  comment: string;
  date: string;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  pdfUrl?: string;
  thumbnail: string;
  category: string;
  authorId: string;
  authorName: string;
  publishedAt: string;
  isPublished: boolean;
  readTime: string;
  tags: string[];
}

/** An instructor application from the become-instructor form. */
export interface InstructorApplication {
  id: string;
  name: string;
  email: string;
  phone?: string;
  expertise?: string;
  experience?: string;
  /** Free-text answer to "Why do you want to teach?" (nullable column, Phase 3). */
  message?: string;
  /** Optional free-text "anything else we should know" (Phase 2). Separate from `message`. */
  additionalInfo?: string;
  /** "Why are you a good fit for CodeBettle?" (Phase 2). Nullable in the DB; required only in form validation. */
  whyGoodFit?: string;
  /** Applicant's account id, matched by email at submit time (Phase 2). Null when the applicant has no account. */
  userId?: string;
  /** Storage path of the uploaded CV in the private `application-files` bucket (e.g. `cvs/<uuid>.pdf`). */
  cvUrl?: string;
  /** Applicant's LinkedIn profile URL. */
  linkedinUrl?: string;
  /** Applicant's GitHub profile URL. */
  githubUrl?: string;
  /** Storage path of the uploaded demo lecture recording in the private `application-files` bucket (e.g. `demos/<uuid>.mp4`). */
  demoRecordingUrl?: string;
  status: ApplicationStatus;
  reviewedBy?: string;
  createdAt: string;
}

export interface SessionRecord {
  /** SHA-256 hash of the opaque token. The raw token is never stored. */
  id: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
  revokedAt: number | null;
  ip?: string;
  userAgent?: string;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string;
  detail?: string;
  ip?: string;
  createdAt: string;
}

export interface LoginEvent {
  id: string;
  userId?: string | null;
  email: string;
  success: boolean;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

export interface PasswordResetRecord {
  id: string;
  userId: string;
  /** SHA-256 hash of the raw token. The raw token is never stored. */
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  /** Phase 3: general | important | warning | special_notice. */
  category: NotificationCategory;
  /** Phase 3: the Announcement this row was fanned out from (receipts). Nullable like readAt — the DB column is nullable. */
  announcementId?: string | null;
  /** Phase 3: optional deep link the notification points to. */
  linkUrl?: string;
  /** Phase 3: true when the user must acknowledge this notification. */
  requiresAcknowledge: boolean;
  /** Phase 3: when the user acknowledged it (null until then). */
  acknowledgedAt?: string | null;
  readAt?: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Prisma row shapes (scalar fields only — what a plain query returns).
// ---------------------------------------------------------------------------
export type UserRow = Pick<
  Models.public_User,
  | 'id'
  | 'name'
  | 'email'
  | 'passwordHash'
  | 'role'
  | 'isAdmin'
  | 'isTeacher'
  | 'avatar'
  | 'bio'
  | 'phone'
  | 'expertise'
  | 'socialLinks'
  | 'notificationPrefs'
  | 'adminPermissions'
  | 'canViewAuditLog'
  | 'status'
  | 'joinedAt'
  | 'deletedAt'
  | 'createdAt'
  | 'updatedAt'
>;

export type CourseRow = Pick<
  Models.public_Course,
  | 'id'
  | 'slug'
  | 'title'
  | 'description'
  | 'longDescription'
  | 'thumbnail'
  | 'category'
  | 'level'
  | 'pricePkr'
  | 'isFree'
  | 'instructorId'
  | 'zoomLink'
  | 'schedule'
  | 'status'
  | 'isFeatured'
  | 'isCompleted'
  | 'completedAt'
  | 'requirements'
  | 'whatYouLearn'
  | 'tags'
  | 'enrolledCount'
  | 'rating'
  | 'reviewCount'
  | 'createdAt'
  | 'updatedAt'
>;

export type ModuleRow = Pick<Models.public_Module, 'id' | 'courseId' | 'title' | 'position'>;

export type LessonRow = Pick<
  Models.public_Lesson,
  'id' | 'moduleId' | 'title' | 'position' | 'description' | 'recordingUrl' | 'materials' | 'duration' | 'date'
>;

export type EnrollmentRow = Pick<
  Models.public_Enrollment,
  | 'id'
  | 'studentId'
  | 'courseId'
  | 'enrolledAt'
  | 'completedAt'
  | 'isCompleted'
  | 'paymentStatus'
  | 'couponUsed'
  | 'amountPaid'
  | 'certificateEligible'
>;

export type LessonProgressRow = Pick<
  Models.public_LessonProgress,
  'enrollmentId' | 'lessonId' | 'completedAt'
>;

export type CertificateRow = Pick<
  Models.public_Certificate,
  'id' | 'studentId' | 'courseId' | 'enrollmentId' | 'certificateNumber' | 'verificationToken' | 'issuedAt'
>;

export type CouponRow = Pick<
  Models.public_Coupon,
  'id' | 'code' | 'type' | 'value' | 'maxUses' | 'usedCount' | 'expiresAt' | 'isActive' | 'createdAt' | 'applicableCourses'
>;

export type AnnouncementRow = Pick<
  Models.public_Announcement,
  'id' | 'title' | 'content' | 'type' | 'courseId' | 'authorId' | 'isActive' | 'createdAt'
>;

export type ReviewRow = Pick<
  Models.public_Review,
  'id' | 'studentId' | 'courseId' | 'rating' | 'comment' | 'createdAt'
>;

export type ContactMessageRow = Pick<
  Models.public_ContactMessage,
  'id' | 'name' | 'email' | 'subject' | 'message' | 'isRead' | 'createdAt'
>;

export type TestimonialRow = Pick<
  Models.public_Testimonial,
  'id' | 'studentName' | 'studentAvatar' | 'courseTitle' | 'rating' | 'comment' | 'date'
>;

export type BlogPostRow = Pick<
  Models.public_BlogPost,
  | 'id'
  | 'slug'
  | 'title'
  | 'excerpt'
  | 'content'
  | 'pdfUrl'
  | 'thumbnail'
  | 'category'
  | 'authorId'
  | 'authorName'
  | 'publishedAt'
  | 'isPublished'
  | 'readTime'
  | 'tags'
  | 'createdAt'
  | 'updatedAt'
>;

export type ApplicationRow = Pick<
  Models.public_InstructorApplication,
  'id' | 'name' | 'email' | 'phone' | 'expertise' | 'experience' | 'message' | 'additionalInfo' | 'whyGoodFit' | 'userId' | 'cvUrl' | 'linkedinUrl' | 'githubUrl' | 'demoRecordingUrl' | 'status' | 'reviewedBy' | 'createdAt'
>;

export type SessionRow = Pick<
  Models.public_Session,
  'id' | 'userId' | 'createdAt' | 'expiresAt' | 'lastSeenAt' | 'revokedAt' | 'ip' | 'userAgent'
>;

export type AuditLogRow = Pick<
  Models.public_AuditLog,
  'id' | 'actorId' | 'action' | 'entity' | 'entityId' | 'detail' | 'ip' | 'createdAt'
>;

export type LoginEventRow = Pick<
  Models.public_LoginEvent,
  'id' | 'userId' | 'email' | 'success' | 'ip' | 'userAgent' | 'createdAt'
>;

export type PasswordResetRow = Pick<
  Models.public_PasswordReset,
  'id' | 'userId' | 'tokenHash' | 'expiresAt' | 'usedAt' | 'createdAt'
>;

export type NotificationRow = Pick<
  Models.public_Notification,
  | 'id'
  | 'userId'
  | 'type'
  | 'title'
  | 'body'
  | 'category'
  | 'announcementId'
  | 'linkUrl'
  | 'requiresAcknowledge'
  | 'acknowledgedAt'
  | 'readAt'
  | 'createdAt'
>;

// ---------------------------------------------------------------------------
// Quiz (Phase 5) — domain types and row shapes.
// ---------------------------------------------------------------------------
export type QuizStatus = 'draft' | 'published' | 'archived';
export type QuizQuestionType = 'mcq' | 'fill_blank' | 'checkbox' | 'choose_two' | 'choose_three';
export type QuizAttemptStatus = 'in_progress' | 'submitted';
export type QuizScoringPolicy = 'exact' | 'partial';

export const QUIZ_QUESTION_TYPES: readonly QuizQuestionType[] = [
  'mcq',
  'fill_blank',
  'checkbox',
  'choose_two',
  'choose_three',
] as const;

/**
 * Exact selection count a question type requires, or null when any
 * non-empty selection is allowed (checkbox) / no options apply
 * (fill-in-the-blank). Enforced server-side on submit and in the UI.
 */
export function requiredSelectionCount(type: QuizQuestionType): number | null {
  switch (type) {
    case 'mcq':
      return 1;
    case 'choose_two':
      return 2;
    case 'choose_three':
      return 3;
    default:
      return null;
  }
}

/** A parse problem the parser flagged (never silently guessed). Stored as Json on Quiz.parseWarnings. Declared as a `type` (not an interface) so it stays assignable to Prisma's JsonValue. */
export type ParseWarning = {
  questionNumber?: number;
  message: string;
  severity: 'error' | 'warning';
};

export interface QuizOption {
  id: string;
  questionId: string;
  text: string;
  position: number;
  /** SERVER-SIDE ONLY. Never send to a student. */
  isCorrect: boolean;
}

export interface QuizQuestion {
  id: string;
  quizId: string;
  type: QuizQuestionType;
  position: number;
  prompt: string;
  points: number;
  topic?: string;
  difficulty?: CourseLevel;
  /** SERVER-SIDE ONLY (fill-in-the-blank key). Never send to a student. */
  correctText?: string;
  /** SERVER-SIDE ONLY (fill-in-the-blank alternates). Never send to a student. */
  acceptedAnswers: string[];
  /** Teacher-facing explanation from the text import. Never send to a student. */
  explanation?: string;
  needsReview: boolean;
  reviewNote?: string;
  options: QuizOption[];
}

export interface Quiz {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  topics: string[];
  difficulty?: CourseLevel;
  timeLimitMin?: number;
  attemptsAllowed: number;
  passMark?: number;
  scoringPolicy: QuizScoringPolicy;
  showResultsToStudents: boolean;
  showCorrectAnswers: boolean;
  availableFrom?: string;
  availableUntil?: string;
  instructions?: string;
  status: QuizStatus;
  createdById: string;
  pdfUrl?: string;
  pdfStoragePath?: string;
  parseWarnings?: ParseWarning[];
  createdAt: string;
  updatedAt: string;
  questions?: QuizQuestion[];
}

export interface QuizAnswer {
  id: string;
  attemptId: string;
  questionId: string;
  selectedOptionIds: string[];
  textAnswer?: string;
  isCorrect?: boolean;
  pointsAwarded: number;
  needsManualReview: boolean;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  studentId: string;
  status: QuizAttemptStatus;
  startedAt: string;
  dueAt?: string;
  submittedAt?: string;
  score?: number;
  totalPoints?: number;
  timeSpentSec?: number;
  submittedLate: boolean;
  answers?: QuizAnswer[];
}

/** An answer as a student may see it: their own selections only, no grading fields. */
export interface StudentQuizAnswer {
  id: string;
  attemptId: string;
  questionId: string;
  selectedOptionIds: string[];
  textAnswer?: string;
}

/** An attempt as a student may see it: selections without grading fields. */
export interface StudentQuizAttempt extends Omit<QuizAttempt, 'answers'> {
  answers?: StudentQuizAnswer[];
}

/** A question as a student may see it: options without correctness, no key text. */
export interface PublicQuizOption {
  id: string;
  text: string;
  position: number;
}

export interface PublicQuizQuestion {
  id: string;
  type: QuizQuestionType;
  position: number;
  prompt: string;
  points: number;
  topic?: string;
  options: PublicQuizOption[];
}

export interface PublicQuiz {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  topics: string[];
  difficulty?: CourseLevel;
  timeLimitMin?: number;
  attemptsAllowed: number;
  passMark?: number;
  instructions?: string;
  availableFrom?: string;
  availableUntil?: string;
  questions: PublicQuizQuestion[];
}

export type QuizRow = Pick<
  Models.public_Quiz,
  | 'id'
  | 'courseId'
  | 'title'
  | 'description'
  | 'topics'
  | 'difficulty'
  | 'timeLimitMin'
  | 'attemptsAllowed'
  | 'passMark'
  | 'scoringPolicy'
  | 'showResultsToStudents'
  | 'showCorrectAnswers'
  | 'availableFrom'
  | 'availableUntil'
  | 'instructions'
  | 'status'
  | 'createdById'
  | 'pdfUrl'
  | 'pdfStoragePath'
  | 'parseWarnings'
  | 'deletedAt'
  | 'createdAt'
  | 'updatedAt'
>;

export type QuizQuestionRow = Pick<
  Models.public_QuizQuestion,
  | 'id'
  | 'quizId'
  | 'type'
  | 'position'
  | 'prompt'
  | 'points'
  | 'topic'
  | 'difficulty'
  | 'correctText'
  | 'acceptedAnswers'
  | 'explanation'
  | 'needsReview'
  | 'reviewNote'
>;

export type QuizOptionRow = Pick<
  Models.public_QuizOption,
  'id' | 'questionId' | 'text' | 'position' | 'isCorrect'
>;

export type QuizAttemptRow = Pick<
  Models.public_QuizAttempt,
  | 'id'
  | 'quizId'
  | 'studentId'
  | 'status'
  | 'startedAt'
  | 'dueAt'
  | 'submittedAt'
  | 'score'
  | 'totalPoints'
  | 'timeSpentSec'
  | 'submittedLate'
>;

export type QuizAnswerRow = Pick<
  Models.public_QuizAnswer,
  | 'id'
  | 'attemptId'
  | 'questionId'
  | 'selectedOptionIds'
  | 'textAnswer'
  | 'isCorrect'
  | 'pointsAwarded'
  | 'needsManualReview'
>;

// ---------------------------------------------------------------------------
// Phase 0/1 — Notes, Wishlist, PaymentSubmission, PaymentAccount.
// ---------------------------------------------------------------------------
export type PaymentMethod = 'bank' | 'easypaisa' | 'jazzcash' | 'wallet' | 'other';
export type PaymentSubmissionStatus = 'submitted' | 'approved' | 'rejected';

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'bank',
  'easypaisa',
  'jazzcash',
  'wallet',
  'other',
] as const;

/**
 * A student's own note (Phase 0/1, Module 4). Replaces the hardcoded
 * INITIAL_NOTES on the student notes page. Every read/write is scoped
 * to one userId in the repository — a user can never see another
 * user's notes. courseId is a loose link to a course (nullable);
 * the note survives if the course is deleted (no cascade).
 */
export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string;
  courseId?: string;
  createdAt: string;
  updatedAt: string;
}

/** One wishlist entry: a student + a course (Phase 0/1, Module 4). */
export interface WishlistItem {
  id: string;
  userId: string;
  courseId: string;
  createdAt: string;
}

/**
 * Frozen copy of the payment account used for a submission, taken at
 * submit time and stored on PaymentSubmission.accountSnapshot (Json).
 * Declared as a `type` (not an `interface`) so it stays assignable to
 * Prisma's JsonValue. Deleting or deactivating the account never
 * damages history, because the submission keeps this copy.
 */
export type PaymentAccountSnapshot = {
  label: string;
  method: PaymentMethod;
  accountHolder: string;
  bankName?: string;
  accountNumber?: string;
  iban?: string;
  walletNumber?: string;
};

/**
 * A published payment account students pay into (Phase 0/1, Module 16).
 * Only active accounts are shown to students, ordered by displayOrder.
 * Only one of accountNumber / iban / walletNumber is expected to be set,
 * depending on the method — the repository does not enforce which.
 */
export interface PaymentAccount {
  id: string;
  label: string;
  method: PaymentMethod;
  accountHolder: string;
  bankName?: string;
  accountNumber?: string;
  iban?: string;
  walletNumber?: string;
  instructions?: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * An admin-managed footer social icon (Phase 4, Module 7).
 * ONLY two things are required per icon: Icon Name (e.g. LinkedIn)
 * and Icon Link (the profile URL). The icon itself is auto-fetched
 * from the name (resolvePlatformKey in lib/social.ts) — there is no
 * image upload. Only enabled icons are shown in the footer, in
 * displayOrder. While no rows exist, the footer falls back to the
 * hardcoded defaults in lib/social.ts.
 */
export interface SocialLink {
  id: string;
  name: string;
  url: string;
  displayOrder: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A student's manual payment submission (Phase 0/1, Module 1).
 * Deliberately a separate model from Payment: Payment is gateway-shaped
 * (provider/providerRef, status paid|failed|refunded) and stays untouched
 * for future gateway use. A submission's lifecycle is
 * submitted -> approved | rejected, recorded with reviewedBy/at/note.
 * One pending (submitted) submission per enrolment at most.
 */
export interface PaymentSubmission {
  id: string;
  enrollmentId: string;
  paymentAccountId?: string;
  method: PaymentMethod;
  amountPkr: number;
  transactionRef: string;
  proofUrl?: string;
  accountSnapshot: PaymentAccountSnapshot;
  reviewStatus: PaymentSubmissionStatus;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
}

export type NoteRow = Pick<
  Models.public_Note,
  'id' | 'userId' | 'title' | 'content' | 'courseId' | 'createdAt' | 'updatedAt'
>;

export type WishlistRow = Pick<
  Models.public_Wishlist,
  'id' | 'userId' | 'courseId' | 'createdAt'
>;

export type PaymentAccountRow = Pick<
  Models.public_PaymentAccount,
  | 'id'
  | 'label'
  | 'method'
  | 'accountHolder'
  | 'bankName'
  | 'accountNumber'
  | 'iban'
  | 'walletNumber'
  | 'instructions'
  | 'isActive'
  | 'displayOrder'
  | 'createdAt'
  | 'updatedAt'
>;

export type PaymentSubmissionRow = Pick<
  Models.public_PaymentSubmission,
  | 'id'
  | 'enrollmentId'
  | 'paymentAccountId'
  | 'method'
  | 'amountPkr'
  | 'transactionRef'
  | 'proofUrl'
  | 'accountSnapshot'
  | 'reviewStatus'
  | 'submittedAt'
  | 'reviewedBy'
  | 'reviewedAt'
  | 'reviewNote'
  | 'createdAt'
  | 'updatedAt'
>;

export type SocialLinkRow = Pick<
  Models.public_SocialLink,
  'id' | 'name' | 'url' | 'displayOrder' | 'isEnabled' | 'createdAt' | 'updatedAt'
>;

// ---------------------------------------------------------------------------
// Phase 2 — Roles & recruitment (Module 22): flags role model + contract
// models. See src/prisma/contract.prisma for the storage semantics.
// ---------------------------------------------------------------------------

/** One pipeline stage an instructor application moves through. Admin-managed; `position` is the display order. */
export interface ApplicationStage {
  id: string;
  name: string;
  position: number;
  instructions?: string;
  createdAt: string;
  updatedAt: string;
}

/** Actions recorded in an application's stage history. */
export type ApplicationStageAction =
  | 'stage_assigned'
  | 'approved'
  | 'rejected'
  | 'info_requested'
  | 'onboarded';

/**
 * One append-only history entry for an application. `stageName` is a
 * denormalised snapshot taken at write time, so the entry stays readable
 * if the stage is later renamed or deleted; `stageId` is null in that
 * case (and for non-stage actions such as approval).
 */
export interface ApplicationStageHistory {
  id: string;
  applicationId: string;
  stageId?: string;
  stageName: string;
  actorId?: string;
  note?: string;
  action: ApplicationStageAction;
  createdAt: string;
}

/**
 * An admin note on an application. `isInternal: true` notes are
 * admin-only; nothing exposes notes to applicants today — a future
 * applicant-visible note would set this false and needs its own read
 * path (do not just flip the flag).
 */
export interface ApplicationNote {
  id: string;
  applicationId: string;
  authorId: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

/**
 * The flags + adminPermissions granted when an invitation is accepted.
 * Declared as a `type` (not an `interface`) so it stays assignable to
 * Prisma's JsonValue. `adminPermissions: null` means full admin;
 * undefined/absent means no per-area restriction is recorded (the
 * accept flow treats a missing map as full admin only when isAdmin is
 * granted — see the invitation service, Phase 2 feature work).
 */
export type InvitationGrants = {
  isAdmin?: boolean;
  isTeacher?: boolean;
  adminPermissions?: AdminPermissions | null;
};

/**
 * An invite to join as staff. Only the SHA-256 hash of the token is
 * stored (same pattern as PasswordReset / EmailVerification) — the raw
 * token is never persisted. Single-use (`usedAt`) and expiring.
 */
export interface Invitation {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  contactNumber?: string;
  grants: InvitationGrants;
  /** SHA-256 hash of the raw token. The raw token is never stored. */
  tokenHash: string;
  expiresAt: string;
  usedAt?: string | null;
  invitedById: string;
  createdAt: string;
}

export type ApplicationStageRow = Pick<
  Models.public_ApplicationStage,
  'id' | 'name' | 'position' | 'instructions' | 'createdAt' | 'updatedAt'
>;

export type ApplicationStageHistoryRow = Pick<
  Models.public_ApplicationStageHistory,
  'id' | 'applicationId' | 'stageId' | 'stageName' | 'actorId' | 'note' | 'action' | 'createdAt'
>;

export type ApplicationNoteRow = Pick<
  Models.public_ApplicationNote,
  'id' | 'applicationId' | 'authorId' | 'body' | 'isInternal' | 'createdAt'
>;

export type InvitationRow = Pick<
  Models.public_Invitation,
  | 'id'
  | 'email'
  | 'firstName'
  | 'lastName'
  | 'contactNumber'
  | 'grants'
  | 'tokenHash'
  | 'expiresAt'
  | 'usedAt'
  | 'invitedById'
  | 'createdAt'
>;

// ---------------------------------------------------------------------------
// Phase 3 — Notifications & Requests (Module 7): support requests.
// ---------------------------------------------------------------------------

/**
 * Support-request category slugs (Phase 3). Stored as the slug value in
 * the DB (String, like Notification.type — no Prisma enum); the display
 * label is the map below. ContactMessage stays the anonymous public
 * inbox and is never overloaded with these.
 */
export type SupportRequestCategory =
  | 'complaints'
  | 'teacher_reviews'
  | 'feature_requests'
  | 'course_issues'
  | 'technical_problems'
  | 'general_requests'
  | 'other';

export const SUPPORT_REQUEST_CATEGORIES: readonly SupportRequestCategory[] = [
  'complaints',
  'teacher_reviews',
  'feature_requests',
  'course_issues',
  'technical_problems',
  'general_requests',
  'other',
] as const;

export const SUPPORT_REQUEST_CATEGORY_LABELS: Record<SupportRequestCategory, string> = {
  complaints: 'Complaints',
  teacher_reviews: 'Teacher reviews',
  feature_requests: 'Feature requests',
  course_issues: 'Course issues',
  technical_problems: 'Technical problems',
  general_requests: 'General requests',
  other: 'Other',
};

/** Support-request lifecycle: new -> under_review -> in_progress -> resolved | rejected. */
export type SupportRequestStatus =
  | 'new'
  | 'under_review'
  | 'in_progress'
  | 'resolved'
  | 'rejected';

export const SUPPORT_REQUEST_STATUSES: readonly SupportRequestStatus[] = [
  'new',
  'under_review',
  'in_progress',
  'resolved',
  'rejected',
] as const;

/** Statuses that close a request (resolvedBy / resolvedAt are set). */
export const SUPPORT_REQUEST_TERMINAL_STATUSES: readonly SupportRequestStatus[] = [
  'resolved',
  'rejected',
] as const;

/**
 * A student's support request (Phase 3). Always owned by one
 * authenticated student (studentId comes from the session, never the
 * request body). `courseId` is set only for a course the student is
 * enrolled in. `attachmentUrl` is the private-bucket storage PATH
 * (e.g. `support-requests/<uuid>.pdf`) in the `application-files`
 * bucket — never a public URL; admins open it via a signed-URL
 * endpoint. `adminReply` is the admin's visible reply to the student.
 */
export interface SupportRequest {
  id: string;
  studentId: string;
  category: SupportRequestCategory;
  subject: string;
  message: string;
  courseId?: string;
  status: SupportRequestStatus;
  attachmentUrl?: string;
  adminReply?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type SupportRequestRow = Pick<
  Models.public_SupportRequest,
  | 'id'
  | 'studentId'
  | 'category'
  | 'subject'
  | 'message'
  | 'courseId'
  | 'status'
  | 'attachmentUrl'
  | 'adminReply'
  | 'resolvedBy'
  | 'resolvedAt'
  | 'createdAt'
  | 'updatedAt'
>;

// ---------------------------------------------------------------------------
// Phase 6 — Forms Builder (registration + survey forms).
// ---------------------------------------------------------------------------

/**
 * One field in a form. This is the SHARED shape every Phase 6 worker
 * uses — do not invent a different one. `type` is the input kind;
 * `options` is required (non-empty) for select/radio/checkbox;
 * `validation` holds the per-field rules; `styling.width` is 'full'
 * (default) or 'half'. There is deliberately NO file-upload type in
 * v1 (public file upload is an abuse surface).
 */
export type FormFieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'password';

export const FORM_FIELD_TYPES: readonly FormFieldType[] = [
  'text',
  'email',
  'tel',
  'textarea',
  'number',
  'date',
  'select',
  'radio',
  'checkbox',
  'password',
] as const;

/** Field types whose value must come from `options`. */
export const FORM_OPTION_FIELD_TYPES: readonly FormFieldType[] = [
  'select',
  'radio',
  'checkbox',
] as const;

export interface FormFieldValidation {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
}

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  validation?: FormFieldValidation;
  styling?: { width?: 'full' | 'half' };
}

/** The stored `FormDefinition.schema` Json value: ordered fields. */
export interface FormSchema {
  fields: FormField[];
}

/** Form kind: 'registration' | 'survey' ONLY — there is no quiz type. */
export type FormType = 'registration' | 'survey';

export const FORM_TYPES: readonly FormType[] = ['registration', 'survey'] as const;

/** Form lifecycle: 'draft' | 'published'. Only published forms are public. */
export type FormStatus = 'draft' | 'published';

export const FORM_STATUSES: readonly FormStatus[] = ['draft', 'published'] as const;

/**
 * A registration/survey form definition (Phase 6). `slug` is the
 * URL-safe public key (/forms/[slug]); `schema` is the stored
 * { fields: FormField[] } — submissions are ALWAYS validated against
 * this stored schema, never a client-sent one.
 */
export interface FormDefinition {
  id: string;
  name: string;
  slug: string;
  type: FormType;
  description?: string;
  schema: FormSchema;
  status: FormStatus;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

/** The public shape of a published form — no internal fields. */
export interface PublicForm {
  id: string;
  name: string;
  description?: string;
  type: FormType;
  schema: FormSchema;
}

/**
 * One filled-in form. `data` is keyed by field id
 * ({ [fieldId]: value }); `submitterId` is null for anonymous
 * (signed-out) submissions.
 */
export interface FormSubmission {
  id: string;
  formId: string;
  submitterId?: string;
  data: Record<string, unknown>;
  reviewed: boolean;
  submittedAt: string;
}

export type FormDefinitionRow = Pick<
  Models.public_FormDefinition,
  | 'id'
  | 'name'
  | 'slug'
  | 'type'
  | 'description'
  | 'schema'
  | 'status'
  | 'createdById'
  | 'createdAt'
  | 'updatedAt'
>;

export type FormSubmissionRow = Pick<
  Models.public_FormSubmission,
  | 'id'
  | 'formId'
  | 'submitterId'
  | 'data'
  | 'reviewed'
  | 'submittedAt'
>;
