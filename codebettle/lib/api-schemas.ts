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
  paymentStatus: z.enum(['paid', 'free', 'pending']),
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
});

export const applicationReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

export const certificateCreateSchema = z.object({
  studentId: z.string().min(1),
  courseId: z.string().min(1),
  enrollmentId: z.string().min(1),
  certificateNumber: z.string().min(1).optional(),
});

export const blogCreateSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  excerpt: z.string().min(1),
  content: z.string().min(1),
  pdfUrl: z.string().optional(),
  thumbnail: z.string().min(1),
  category: z.string().min(1),
  authorName: z.string().optional(),
  publishedAt: z.string().optional(),
  isPublished: z.boolean().optional(),
  readTime: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

export const blogUpdateSchema = z.object({
  slug: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  excerpt: z.string().optional(),
  content: z.string().min(1).optional(),
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
