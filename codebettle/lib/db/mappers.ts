/**
 * Contract <-> domain mapping (Phase 2). Pure functions — unit-tested.
 *
 * Storage shapes (Prisma contract) differ from the shapes pages use:
 * - Money: pricePkr (int) <-> price (number, PKR).
 * - Categories: Web_Development (enum) <-> 'Web Development' (display).
 * - Announcement type: site_wide <-> 'site-wide'.
 * - Dates: Date (timestamptz) <-> 'YYYY-MM-DD' strings.
 * - Courses: flat Module/Lesson tables <-> nested modules[].lessons[].
 * - Enrolments: LessonProgress rows <-> completedLessons: string[].
 * - Users: no enrolledCourses column <-> computed from Enrollment rows.
 */
import type {
  Announcement,
  AnnouncementRow,
  AnnouncementType,
  BlogPost,
  BlogPostRow,
  Certificate,
  CertificateRow,
  Coupon,
  CouponRow,
  Course,
  CourseCategory,
  CourseRow,
  Enrollment,
  EnrollmentRow,
  Lesson,
  LessonProgressRow,
  LessonRow,
  Module,
  ModuleRow,
  Review,
  ReviewRow,
  SocialLinks,
  Testimonial,
  TestimonialRow,
  User,
  UserRow,
} from './types';

export const CATEGORY_TO_STORAGE: Record<CourseCategory, CourseRow['category']> = {
  'Web Development': 'Web_Development',
  'Mobile Development': 'Mobile_Development',
  'Data Science': 'Data_Science',
  'UI/UX Design': 'UI_UX_Design',
  DevOps: 'DevOps',
  Programming: 'Programming',
};

export const CATEGORY_FROM_STORAGE: Record<string, CourseCategory> = {
  Web_Development: 'Web Development',
  Mobile_Development: 'Mobile Development',
  Data_Science: 'Data Science',
  UI_UX_Design: 'UI/UX Design',
  DevOps: 'DevOps',
  Programming: 'Programming',
};

export function categoryToStorage(display: CourseCategory): CourseRow['category'] {
  return CATEGORY_TO_STORAGE[display];
}

export function categoryFromStorage(stored: string): CourseCategory {
  const mapped = CATEGORY_FROM_STORAGE[stored];
  if (!mapped) throw new Error(`Unknown course category in database: ${stored}`);
  return mapped;
}

export function announcementTypeFromStorage(stored: string): AnnouncementType {
  if (stored === 'site_wide') return 'site-wide';
  if (stored === 'course') return 'course';
  throw new Error(`Unknown announcement type in database: ${stored}`);
}

export function announcementTypeToStorage(display: AnnouncementType): AnnouncementRow['type'] {
  return display === 'site-wide' ? 'site_wide' : 'course';
}

/** Date -> 'YYYY-MM-DD' (UTC date part, matching the old seed format). */
export function dateToString(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' (or ISO string) -> Date. Returns null for empty input. */
export function stringToDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date string: ${s}`);
  return d;
}

/** Safely read a Json column as a SocialLinks object (null when absent/invalid). */
export function toSocialLinks(value: unknown): SocialLinks | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: SocialLinks = {};
  for (const key of ['github', 'linkedin', 'twitter', 'website'] as const) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === 'string') out[key] = v;
  }
  return out;
}

/** Safely read a Json column as a CourseSchedule object (undefined when absent/invalid). */
export function toSchedule(value: unknown): Course['schedule'] {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.classTime !== 'string' || typeof v.classDuration !== 'string') return undefined;
  if (typeof v.startDate !== 'string') return undefined;
  const scheduleType = v.scheduleType;
  if (
    scheduleType !== 'weekdays' &&
    scheduleType !== 'weekends' &&
    scheduleType !== 'whole-week' &&
    scheduleType !== 'custom'
  ) {
    return undefined;
  }
  return {
    classTime: v.classTime,
    classDuration: v.classDuration,
    scheduleType,
    customDays: Array.isArray(v.customDays) ? (v.customDays.filter((x) => typeof x === 'string') as string[]) : undefined,
    startDate: v.startDate,
    notes: typeof v.notes === 'string' ? v.notes : undefined,
  };
}

/** Safely read a Json column as lesson materials (always an array). */
export function toMaterials(value: unknown): Lesson['materials'] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
    .map((m) => ({
      name: typeof m.name === 'string' ? m.name : '',
      url: typeof m.url === 'string' ? m.url : '',
    }));
}

// ---------------------------------------------------------------------------
// Row -> domain
// ---------------------------------------------------------------------------

export function mapUserRow(row: UserRow, enrolledCourseIds?: string[]): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.passwordHash,
    role: row.role,
    avatar: row.avatar ?? undefined,
    bio: row.bio ?? undefined,
    phone: row.phone ?? undefined,
    expertise: [...(row.expertise ?? [])],
    socialLinks: toSocialLinks(row.socialLinks),
    status: row.status,
    joinedAt: dateToString(row.joinedAt),
    enrolledCourses: enrolledCourseIds,
    wishlist: [],
  };
}

export function toSafeUser(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash: _passwordHash, ...safe } = user;
  void _passwordHash;
  return safe;
}

export function mapLessonRow(row: LessonRow): Lesson {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    date: dateToString(row.date),
    driveRecordingUrl: row.recordingUrl ?? '',
    materials: toMaterials(row.materials),
    duration: row.duration ?? '',
  };
}

export function mapModuleRow(row: ModuleRow, lessons: LessonRow[]): Module {
  return {
    id: row.id,
    title: row.title,
    lessons: [...lessons]
      .sort((a, b) => a.position - b.position)
      .map(mapLessonRow),
  };
}

export function mapCourseRow(
  row: CourseRow,
  modulesWithLessons: Array<ModuleRow & { lessons: LessonRow[] }>,
): Course {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    longDescription: row.longDescription,
    thumbnail: row.thumbnail,
    category: categoryFromStorage(row.category),
    level: row.level,
    price: row.pricePkr,
    isFree: row.isFree,
    instructorId: row.instructorId,
    zoomLink: row.zoomLink ?? '',
    schedule: toSchedule(row.schedule),
    status: row.status,
    isFeatured: row.isFeatured,
    isCompleted: row.isCompleted,
    completedAt: row.completedAt ? dateToString(row.completedAt) : undefined,
    modules: [...modulesWithLessons]
      .sort((a, b) => a.position - b.position)
      .map((m) => mapModuleRow(m, m.lessons)),
    requirements: [...(row.requirements ?? [])],
    whatYouLearn: [...(row.whatYouLearn ?? [])],
    tags: [...(row.tags ?? [])],
    enrolledCount: row.enrolledCount,
    rating: row.rating,
    reviewCount: row.reviewCount,
    createdAt: dateToString(row.createdAt),
    updatedAt: dateToString(row.updatedAt),
  };
}

export function mapEnrollmentRow(row: EnrollmentRow, progress: LessonProgressRow[]): Enrollment {
  return {
    id: row.id,
    studentId: row.studentId,
    courseId: row.courseId,
    enrolledAt: dateToString(row.enrolledAt),
    completedLessons: progress
      .filter((p) => p.enrollmentId === row.id)
      .map((p) => p.lessonId),
    isCompleted: row.isCompleted,
    completedAt: row.completedAt ? dateToString(row.completedAt) : undefined,
    paymentStatus: row.paymentStatus,
    couponUsed: row.couponUsed ?? undefined,
    amountPaid: row.amountPaid,
    certificateEligible: row.certificateEligible ?? undefined,
  };
}

export function mapCertificateRow(row: CertificateRow): Certificate {
  return {
    id: row.id,
    studentId: row.studentId,
    courseId: row.courseId,
    enrollmentId: row.enrollmentId,
    issuedAt: dateToString(row.issuedAt),
    certificateNumber: row.certificateNumber,
    verificationToken: row.verificationToken,
  };
}

export function mapCouponRow(row: CouponRow): Coupon {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: row.value,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    expiresAt: dateToString(row.expiresAt),
    isActive: row.isActive,
    createdAt: dateToString(row.createdAt),
    applicableCourses: [...(row.applicableCourses ?? [])],
  };
}

export function mapAnnouncementRow(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    type: announcementTypeFromStorage(row.type),
    courseId: row.courseId ?? undefined,
    authorId: row.authorId,
    createdAt: dateToString(row.createdAt),
    isActive: row.isActive,
  };
}

export function mapReviewRow(row: ReviewRow): Review {
  return {
    id: row.id,
    studentId: row.studentId,
    courseId: row.courseId,
    rating: row.rating,
    comment: row.comment,
    createdAt: dateToString(row.createdAt),
  };
}

export function mapTestimonialRow(row: TestimonialRow): Testimonial {
  return {
    id: row.id,
    studentName: row.studentName,
    studentAvatar: row.studentAvatar,
    courseTitle: row.courseTitle,
    rating: row.rating,
    comment: row.comment,
    date: dateToString(row.date),
  };
}

export function mapBlogPostRow(row: BlogPostRow): BlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    pdfUrl: row.pdfUrl ?? undefined,
    thumbnail: row.thumbnail,
    category: row.category,
    authorId: row.authorId,
    authorName: row.authorName,
    publishedAt: dateToString(row.publishedAt),
    isPublished: row.isPublished,
    readTime: row.readTime,
    tags: [...(row.tags ?? [])],
  };
}
