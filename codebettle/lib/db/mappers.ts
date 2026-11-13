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
  Batch,
  BatchRow,
  BlogPost,
  BlogPostRow,
  Certificate,
  CertificateRow,
  CertificateRowLike,
  ContactMessage,
  ContactMessageRow,
  Coupon,
  CouponRow,
  Course,
  CourseCategory,
  CourseRow,
  CourseRowLike,
  Enrollment,
  EnrollmentRow,
  EmailTemplate,
  EmailTemplateRow,
  FormDefinition,
  FormDefinitionRow,
  FormField,
  FormFieldType,
  FormSchema,
  FormSubmission,
  FormSubmissionRow,
  Lesson,
  LessonProgressRow,
  LessonRow,
  Module,
  ModuleRow,
  Notification,
  NotificationEventKey,
  NotificationPrefs,
  NotificationRow,
  NavItem,
  NavItemRow,
  ParseWarning,
  PublicCourse,
  PublicQuiz,
  Quiz,
  QuizAnswer,
  QuizAnswerRow,
  QuizAttempt,
  QuizAttemptRow,
  QuizOption,
  QuizOptionRow,
  QuizQuestion,
  QuizQuestionRow,
  QuizRow,
  Review,
  ReviewRow,
  SocialLinks,
  SupportRequest,
  SupportRequestRow,
  SuccessStoryAchievement,
  SuccessStoryAchievementRow,
  SuccessStoryEvidence,
  SuccessStoryEvidenceRow,
  SuccessStorySubmission,
  SuccessStorySubmissionRow,
  StudentReview,
  StudentReviewRow,
  TeamMember,
  TeamMemberRow,
  Testimonial,
  TestimonialRow,
  User,
  UserRow,
} from './types';
import { DEFAULT_NOTIFICATION_PREFS, FORM_FIELD_TYPES, FORM_STATUSES, NOTIFICATION_EVENT_KEYS } from './types';
import { isUploadVariant } from '../form-uploads';
import { toAdminPermissions } from '../admin-access';

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

/**
 * Drop keys whose value is undefined from a partial update object.
 * Real Prisma ignores undefined in update data, but the in-memory fake
 * (tests) applies Object.assign, which would overwrite a stored value
 * with undefined — so every repository update strips them first.
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
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

/** Safely read a Json column as a CourseSchedule object (undefined when absent/invalid). */export function toSchedule(value: unknown): Course['schedule'] {
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

/** Safely read a Json column as NotificationPrefs. NULL (or a missing /
 * non-boolean field) falls back to the defaults — so a partially-written
 * prefs object never disables a channel by accident. */
export function toNotificationPrefs(value: unknown): NotificationPrefs {
  const defaults = DEFAULT_NOTIFICATION_PREFS;
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return {
      inApp: defaults.inApp,
      email: defaults.email,
      events: { ...defaults.events },
    };
  }
  const v = value as Record<string, unknown>;
  const eventsRaw = v.events;
  const events = { ...defaults.events };
  if (eventsRaw !== null && typeof eventsRaw === 'object' && !Array.isArray(eventsRaw)) {
    for (const key of NOTIFICATION_EVENT_KEYS as readonly NotificationEventKey[]) {
      const flag = (eventsRaw as Record<string, unknown>)[key];
      if (typeof flag === 'boolean') events[key] = flag;
    }
  }
  return {
    inApp: typeof v.inApp === 'boolean' ? v.inApp : defaults.inApp,
    email: typeof v.email === 'boolean' ? v.email : defaults.email,
    events,
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
    // Phase 2 flags. `?? false` covers rows seeded/created before the
    // flags existed (fake-db rows in tests, pre-migration rows).
    isAdmin: row.isAdmin ?? false,
    isTeacher: row.isTeacher ?? false,
    avatar: row.avatar ?? undefined,
    bio: row.bio ?? undefined,
    phone: row.phone ?? undefined,
    expertise: [...(row.expertise ?? [])],
    socialLinks: toSocialLinks(row.socialLinks),
    notificationPrefs: toNotificationPrefs(row.notificationPrefs),
    adminPermissions: toAdminPermissions(row.adminPermissions),
    // Phase 5: `?? false` covers rows written before the column
    // existed (fake-db rows in tests, pre-migration rows).
    canViewAuditLog: row.canViewAuditLog ?? false,
    status: row.status,
    joinedAt: dateToString(row.joinedAt),
    enrolledCourses: enrolledCourseIds ?? [],
    wishlist: [],
  };
}

export function toSafeUser(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash: _passwordHash, ...safe } = user;
  void _passwordHash;
  return safe;
}

/**
 * Public course shape: the full course minus the Zoom link, every lesson
 * recording URL and every lesson materials URL. Use this for every
 * payload that reaches an anonymous visitor or a client component on a
 * public page (catalogue API, course detail API, /courses pages).
 * Recordings and materials are bearer links (anyone with the URL can
 * open them), so they must never appear in a public payload — enrolled
 * students with a confirmed payment get them from the authenticated
 * GET /api/student/courses/[id]/content endpoint instead.
 * The original course is not mutated: lessons are copied with the
 * sensitive fields blanked.
 */
export function toPublicCourse(course: Course): PublicCourse {
  const { zoomLink: _zoomLink, ...pub } = course;
  void _zoomLink;
  return {
    ...pub,
    modules: pub.modules.map((mod) => ({
      ...mod,
      lessons: mod.lessons.map((lesson) => ({
        ...lesson,
        driveRecordingUrl: '',
        materials: [],
      })),
    })),
  };
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
  row: CourseRowLike,
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
    // Rows read before the Phase 2 migration ran carry no template column.
    certificateTemplateHtml: row.certificateTemplateHtml ?? null,
    // Rows read before the outline migration ran carry no outline column.
    outlineUrl: row.outlineUrl ?? null,
    createdAt: dateToString(row.createdAt),
    updatedAt: dateToString(row.updatedAt),
  };
}

export function mapEnrollmentRow(row: EnrollmentRow, progress: LessonProgressRow[]): Enrollment {
  return {
    id: row.id,
    studentId: row.studentId,
    courseId: row.courseId,
    batchId: row.batchId ?? undefined,
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

/** Map a Batch row to the domain shape. */
export function mapBatchRow(row: BatchRow, enrolledCount?: number): Batch {
  return {
    id: row.id,
    courseId: row.courseId,
    batchNumber: row.batchNumber,
    status: row.status,
    startDate: row.startDate ? dateToString(row.startDate) : undefined,
    endDate: row.endDate ? dateToString(row.endDate) : undefined,
    capacity: row.capacity ?? undefined,
    instructorId: row.instructorId ?? undefined,
    createdAt: dateToString(row.createdAt),
    updatedAt: dateToString(row.updatedAt),
    enrolledCount,
  };
}

export function mapCertificateRow(row: CertificateRowLike): Certificate {
  // batch / revokedAt are read defensively: rows seeded in tests (and
  // rows read before the Phase 2 migration ran) may not carry them.
  const batch = row.batch ?? null;
  const revokedAt = row.revokedAt;
  return {
    id: row.id,
    studentId: row.studentId,
    courseId: row.courseId,
    enrollmentId: row.enrollmentId,
    issuedAt: dateToString(row.issuedAt),
    certificateNumber: row.certificateNumber,
    verificationToken: row.verificationToken,
    batch,
    revokedAt: revokedAt ? dateToString(revokedAt) : null,
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

export function mapContactMessageRow(row: ContactMessageRow): ContactMessage {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    subject: row.subject ?? undefined,
    message: row.message,
    isRead: row.isRead,
    createdAt: dateToString(row.createdAt),
  };
}

export function mapNotificationRow(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    title: row.title,
    body: row.body,
    // Phase 3 fields default for rows written before the migration
    // (and for fake-db rows in tests that omit them).
    category: isNotificationCategory(row.category) ? row.category : 'general',
    announcementId: row.announcementId ?? undefined,
    linkUrl: row.linkUrl ?? undefined,
    requiresAcknowledge: row.requiresAcknowledge ?? false,
    acknowledgedAt: row.acknowledgedAt ? dateToString(row.acknowledgedAt) : null,
    readAt: row.readAt ? dateToString(row.readAt) : null,
    createdAt: dateToString(row.createdAt),
  };
}

function isNotificationCategory(value: unknown): value is Notification['category'] {
  return value === 'general' || value === 'important' || value === 'warning' || value === 'special_notice';
}

export function mapSupportRequestRow(row: SupportRequestRow): SupportRequest {
  return {
    id: row.id,
    studentId: row.studentId,
    category: isSupportRequestCategory(row.category) ? row.category : 'other',
    subject: row.subject,
    message: row.message,
    courseId: row.courseId ?? undefined,
    status: isSupportRequestStatus(row.status) ? row.status : 'new',
    attachmentUrl: row.attachmentUrl ?? undefined,
    adminReply: row.adminReply ?? undefined,
    resolvedBy: row.resolvedBy ?? undefined,
    resolvedAt: row.resolvedAt ? dateToString(row.resolvedAt) : undefined,
    createdAt: dateToString(row.createdAt),
    updatedAt: dateToString(row.updatedAt),
  };
}

function isSupportRequestCategory(value: unknown): value is SupportRequest['category'] {
  return (
    value === 'complaints' ||
    value === 'teacher_reviews' ||
    value === 'feature_requests' ||
    value === 'course_issues' ||
    value === 'technical_problems' ||
    value === 'general_requests' ||
    value === 'other'
  );
}

function isSupportRequestStatus(value: unknown): value is SupportRequest['status'] {
  return (
    value === 'new' ||
    value === 'under_review' ||
    value === 'in_progress' ||
    value === 'resolved' ||
    value === 'rejected'
  );
}

// ---------------------------------------------------------------------------
// Phase 6 — Forms Builder.
// ---------------------------------------------------------------------------

/**
 * Safely read the stored `FormDefinition.schema` Json column. A row
 * whose schema is missing/invalid (e.g. hand-edited in the DB) reads
 * as an empty field list instead of crashing the caller — the service
 * validates the schema on every write, so a stored row is valid in
 * practice. Fields are normalised to the shared shape (unknown keys
 * dropped, defaults applied) so readers never see a malformed field.
 */
export function toFormSchema(value: unknown): FormSchema {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return { fields: [] };
  }
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.fields)) return { fields: [] };
  const fields: FormField[] = [];
  for (const item of raw.fields) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    const f = item as Record<string, unknown>;
    if (typeof f.id !== 'string' || f.id.trim() === '') continue;
    const type = (FORM_FIELD_TYPES as readonly string[]).includes(String(f.type))
      ? (f.type as FormFieldType)
      : 'text';
    const field: FormField = {
      id: f.id,
      type,
      label: typeof f.label === 'string' ? f.label : f.id,
      required: f.required === true,
    };
    if (typeof f.placeholder === 'string') field.placeholder = f.placeholder;
    if (Array.isArray(f.options)) {
      field.options = f.options.filter((o): o is string => typeof o === 'string');
    }
    if (f.validation !== null && typeof f.validation === 'object' && !Array.isArray(f.validation)) {
      const v = f.validation as Record<string, unknown>;
      const validation: NonNullable<FormField['validation']> = {};
      if (typeof v.minLength === 'number') validation.minLength = v.minLength;
      if (typeof v.maxLength === 'number') validation.maxLength = v.maxLength;
      if (typeof v.pattern === 'string') validation.pattern = v.pattern;
      if (typeof v.min === 'number') validation.min = v.min;
      if (typeof v.max === 'number') validation.max = v.max;
      if (Object.keys(validation).length > 0) field.validation = validation;
    }
    if (f.styling !== null && typeof f.styling === 'object' && !Array.isArray(f.styling)) {
      const width = (f.styling as Record<string, unknown>).width;
      if (width === 'full' || width === 'half') field.styling = { width };
    }
    // File fields keep their upload variant (default 'files' when the
    // stored field has none or an unknown one — an old schema without
    // the variant still renders and validates as a generic upload).
    if (type === 'file') {
      field.uploadVariant = isUploadVariant(f.uploadVariant) ? f.uploadVariant : 'files';
    }
    fields.push(field);
  }
  // Form-level settings travel inside the schema — preserve them so
  // the public form sees the builder's button text / success message.
  const out: FormSchema = { fields };
  if (typeof raw.submitButtonText === 'string') out.submitButtonText = raw.submitButtonText;
  if (typeof raw.successMessage === 'string') out.successMessage = raw.successMessage;
  return out;
}

/** Safely read a stored submission `data` Json value (object keyed by field id). */
export function toFormSubmissionData(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function mapFormDefinitionRow(row: FormDefinitionRow): FormDefinition {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    // `type` is the form's free-text purpose — passed through as
    // stored (a blank legacy value falls back to 'General').
    type: typeof row.type === 'string' && row.type.trim() ? row.type : 'General',
    description: row.description ?? undefined,
    schema: toFormSchema(row.schema),
    status: (FORM_STATUSES as readonly string[]).includes(row.status)
      ? (row.status as FormDefinition['status'])
      : 'draft',
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapFormSubmissionRow(row: FormSubmissionRow): FormSubmission {
  return {
    id: row.id,
    formId: row.formId,
    submitterId: row.submitterId ?? undefined,
    data: toFormSubmissionData(row.data),
    reviewed: row.reviewed,
    submittedAt: row.submittedAt.toISOString(),
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

export function mapSuccessStoryEvidenceRow(row: SuccessStoryEvidenceRow): SuccessStoryEvidence {
  return {
    id: row.id,
    achievementId: row.achievementId,
    kind: row.kind === 'link' ? 'link' : 'file',
    label: row.label ?? undefined,
    url: row.url,
    fileName: row.fileName ?? undefined,
    mime: row.mime ?? undefined,
    size: row.size ?? undefined,
    createdAt: dateToString(row.createdAt),
  };
}

export function mapSuccessStoryAchievementRow(
  row: SuccessStoryAchievementRow,
  evidence: SuccessStoryEvidenceRow[] = [],
): SuccessStoryAchievement {
  return {
    id: row.id,
    submissionId: row.submissionId,
    category: row.category,
    title: row.title,
    organization: row.organization ?? undefined,
    description: row.description ?? undefined,
    achievedAt: row.achievedAt ? dateToString(row.achievedAt) : undefined,
    createdAt: dateToString(row.createdAt),
    evidence: evidence.map(mapSuccessStoryEvidenceRow),
  };
}

export function mapSuccessStorySubmissionRow(
  row: SuccessStorySubmissionRow,
  achievements: { achievement: SuccessStoryAchievementRow; evidence: SuccessStoryEvidenceRow[] }[] = [],
): SuccessStorySubmission {
  return {
    id: row.id,
    submissionNumber: row.submissionNumber,
    submitterId: row.submitterId ?? undefined,
    fullName: row.fullName,
    email: row.email,
    profilePicturePath: row.profilePicturePath ?? undefined,
    country: row.country,
    city: row.city ?? undefined,
    designation: row.designation ?? undefined,
    linkedinUrl: row.linkedinUrl ?? undefined,
    courseId: row.courseId ?? undefined,
    courseTitle: row.courseTitle,
    batchId: row.batchId ?? undefined,
    batchNumber: row.batchNumber ?? undefined,
    joinedAt: row.joinedAt ? dateToString(row.joinedAt) : undefined,
    instructorName: row.instructorName ?? undefined,
    skillsLearned: row.skillsLearned,
    experience: row.experience,
    story: row.story,
    beforeJoining: row.beforeJoining ?? undefined,
    challenges: row.challenges ?? undefined,
    howHelped: row.howHelped ?? undefined,
    achievementsAfter: row.achievementsAfter ?? undefined,
    biggestAchievement: row.biggestAchievement ?? undefined,
    advice: row.advice ?? undefined,
    githubUrl: row.githubUrl ?? undefined,
    instagramUrl: row.instagramUrl ?? undefined,
    youtubeUrl: row.youtubeUrl ?? undefined,
    portfolioUrl: row.portfolioUrl ?? undefined,
    lablabUrl: row.lablabUrl ?? undefined,
    leetcodeUrl: row.leetcodeUrl ?? undefined,
    hackerrankUrl: row.hackerrankUrl ?? undefined,
    otherProfileUrl: row.otherProfileUrl ?? undefined,
    videoPath: row.videoPath ?? undefined,
    videoUrl: row.videoUrl ?? undefined,
    videoDescription: row.videoDescription ?? undefined,
    consentPublication: row.consentPublication,
    consentMedia: row.consentMedia,
    consentAccuracy: row.consentAccuracy,
    consentContact: row.consentContact,
    status: row.status,
    featured: row.featured,
    enabled: row.enabled ?? true,
    displayOrder: row.displayOrder ?? 0,
    adminCreated: row.adminCreated ?? false,
    adminNote: row.adminNote ?? undefined,
    reviewedBy: row.reviewedBy ?? undefined,
    reviewedAt: row.reviewedAt ? dateToString(row.reviewedAt) : undefined,
    submittedAt: dateToString(row.submittedAt),
    updatedAt: dateToString(row.updatedAt),
    achievements: achievements.map((a) => mapSuccessStoryAchievementRow(a.achievement, a.evidence)),
  };
}

// ---------------------------------------------------------------------------
// Success Stories Management (PR #32).
// ---------------------------------------------------------------------------

export function mapTeamMemberRow(row: TeamMemberRow): TeamMember {
  return {
    id: row.id,
    photoUrl: row.photoUrl ?? undefined,
    fullName: row.fullName,
    designation: row.designation,
    bio: row.bio ?? undefined,
    xUrl: row.xUrl ?? undefined,
    linkedinUrl: row.linkedinUrl ?? undefined,
    githubUrl: row.githubUrl ?? undefined,
    websiteUrl: row.websiteUrl ?? undefined,
    level: row.level,
    orderInLevel: row.orderInLevel,
    enabled: row.enabled,
    createdAt: dateToString(row.createdAt),
    updatedAt: dateToString(row.updatedAt),
  };
}

export function mapStudentReviewRow(row: StudentReviewRow): StudentReview {
  return {
    id: row.id,
    fullName: row.fullName,
    role: row.role,
    photoUrl: row.photoUrl ?? undefined,
    rating: row.rating,
    reviewText: row.reviewText,
    linkedinUrl: row.linkedinUrl ?? undefined,
    githubUrl: row.githubUrl ?? undefined,
    websiteUrl: row.websiteUrl ?? undefined,
    order: row.order,
    enabled: row.enabled,
    createdAt: dateToString(row.createdAt),
    updatedAt: dateToString(row.updatedAt),
  };
}

export function mapNavItemRow(row: NavItemRow): NavItem {
  return {
    id: row.id,
    label: row.label,
    href: row.href,
    order: row.order,
    enabled: row.enabled,
    createdAt: dateToString(row.createdAt),
    updatedAt: dateToString(row.updatedAt),
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

// ---------------------------------------------------------------------------
// Quiz (Phase 5).
// ---------------------------------------------------------------------------

/** Safely read the Quiz.parseWarnings Json column (null/invalid -> undefined). */
export function readParseWarnings(value: unknown): ParseWarning[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ParseWarning[] = [];
  for (const item of value) {
    if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).message === 'string') {
      const rec = item as Record<string, unknown>;
      out.push({
        ...(typeof rec.questionNumber === 'number' ? { questionNumber: rec.questionNumber } : {}),
        message: rec.message as string,
        severity: rec.severity === 'error' ? 'error' : 'warning',
      });
    }
  }
  return out.length > 0 ? out : undefined;
}

export function mapQuizOptionRow(row: QuizOptionRow): QuizOption {
  return {
    id: row.id,
    questionId: row.questionId,
    text: row.text,
    position: row.position,
    isCorrect: row.isCorrect,
  };
}

export function mapQuizQuestionRow(row: QuizQuestionRow, options: QuizOptionRow[]): QuizQuestion {
  return {
    id: row.id,
    quizId: row.quizId,
    type: row.type,
    position: row.position,
    prompt: row.prompt,
    points: row.points,
    topic: row.topic ?? undefined,
    difficulty: row.difficulty ?? undefined,
    correctText: row.correctText ?? undefined,
    acceptedAnswers: [...(row.acceptedAnswers ?? [])],
    explanation: row.explanation ?? undefined,
    needsReview: row.needsReview,
    reviewNote: row.reviewNote ?? undefined,
    options: options.map(mapQuizOptionRow),
  };
}

export function mapQuizRow(
  row: QuizRow,
  questions: Array<{ question: QuizQuestionRow; options: QuizOptionRow[] }>,
): Quiz {
  return {
    id: row.id,
    courseId: row.courseId,
    title: row.title,
    description: row.description ?? undefined,
    topics: [...(row.topics ?? [])],
    difficulty: row.difficulty ?? undefined,
    timeLimitMin: row.timeLimitMin ?? undefined,
    attemptsAllowed: row.attemptsAllowed,
    passMark: row.passMark ?? undefined,
    scoringPolicy: row.scoringPolicy,
    showResultsToStudents: row.showResultsToStudents,
    showCorrectAnswers: row.showCorrectAnswers,
    availableFrom: row.availableFrom ? row.availableFrom.toISOString() : undefined,
    availableUntil: row.availableUntil ? row.availableUntil.toISOString() : undefined,
    instructions: row.instructions ?? undefined,
    status: row.status,
    createdById: row.createdById,
    pdfUrl: row.pdfUrl ?? undefined,
    pdfStoragePath: row.pdfStoragePath ?? undefined,
    parseWarnings: readParseWarnings(row.parseWarnings),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    questions: questions.map(({ question, options }) => mapQuizQuestionRow(question, options)),
  };
}

export function mapQuizAnswerRow(row: QuizAnswerRow): QuizAnswer {
  return {
    id: row.id,
    attemptId: row.attemptId,
    questionId: row.questionId,
    selectedOptionIds: [...(row.selectedOptionIds ?? [])],
    textAnswer: row.textAnswer ?? undefined,
    isCorrect: row.isCorrect ?? undefined,
    pointsAwarded: row.pointsAwarded,
    needsManualReview: row.needsManualReview,
  };
}

export function mapQuizAttemptRow(row: QuizAttemptRow, answers: QuizAnswerRow[]): QuizAttempt {
  return {
    id: row.id,
    quizId: row.quizId,
    studentId: row.studentId,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    dueAt: row.dueAt ? row.dueAt.toISOString() : undefined,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : undefined,
    score: row.score ?? undefined,
    totalPoints: row.totalPoints ?? undefined,
    timeSpentSec: row.timeSpentSec ?? undefined,
    submittedLate: row.submittedLate,
    answers: answers.map(mapQuizAnswerRow),
  };
}

/**
 * Strip the answer key from a quiz for student delivery. This is the ONLY
 * shape students ever receive: option correctness, fill-in-the-blank
 * key text and accepted alternates are all dropped here, and the service
 * layer never returns the full Quiz to a student. Covered by
 * tests/quiz-api.test.ts (asserts no key material anywhere in the payload).
 */
export function toPublicQuiz(quiz: Quiz): PublicQuiz {
  return {
    id: quiz.id,
    courseId: quiz.courseId,
    title: quiz.title,
    description: quiz.description,
    topics: [...quiz.topics],
    difficulty: quiz.difficulty,
    timeLimitMin: quiz.timeLimitMin,
    attemptsAllowed: quiz.attemptsAllowed,
    passMark: quiz.passMark,
    instructions: quiz.instructions,
    availableFrom: quiz.availableFrom,
    availableUntil: quiz.availableUntil,
    questions: (quiz.questions ?? []).map((q) => ({
      id: q.id,
      type: q.type,
      position: q.position,
      prompt: q.prompt,
      points: q.points,
      topic: q.topic,
      options: q.options.map((o) => ({ id: o.id, text: o.text, position: o.position })),
    })),
  };
}

/** Map a stored email-template row. Unknown `type` values fall back to 'broadcast'. */
export function mapEmailTemplateRow(row: EmailTemplateRow): EmailTemplate {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    htmlBody: row.htmlBody,
    type: row.type === 'system' ? 'system' : 'broadcast',
    isActive: row.isActive ?? true,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
