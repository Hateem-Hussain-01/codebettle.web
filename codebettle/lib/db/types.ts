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

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  avatar?: string;
  bio?: string;
  phone?: string;
  expertise?: string[];
  socialLinks?: SocialLinks;
  status: UserStatus;
  joinedAt: string;
  /** Course ids the student is enrolled in. Populated by list/getStudents and getUserByIdWithEnrollments; undefined otherwise. */
  enrolledCourses?: string[];
  /** No wishlist table exists in the Phase 2 contract — always [] (Phase 3). */
  wishlist?: string[];
}

/** A user with the password hash removed — the only shape pages and API responses may carry. */
export type SafeUser = Omit<User, 'passwordHash'>;

export interface CourseSchedule {
  classTime: string;
  classDuration: string;
  scheduleType: ScheduleType;
  customDays?: string[];
  startDate: string;
  notes?: string;
}

export interface InstructorReview {
  rating: number;
  comment: string;
  submittedAt: string;
}

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
  /** Not stored in the Phase 2 contract (no seed data carries them). Always undefined. */
  instructorPrivateReview?: InstructorReview;
  /** Not stored in the Phase 2 contract (no seed data carries them). Always undefined. */
  instructorClassReview?: InstructorReview;
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
  | 'avatar'
  | 'bio'
  | 'phone'
  | 'expertise'
  | 'socialLinks'
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
