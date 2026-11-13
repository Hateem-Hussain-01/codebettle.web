/**
 * Success story achievement categories (Submit Your Success Story).
 *
 * Pure, client-safe module: no server imports, so the multi-step form,
 * the admin UI and the server validators all share ONE definition of
 * the categories. The category value stored on
 * SuccessStoryAchievement.category is the `value` string; `label` is
 * what the UI shows.
 */

export type SuccessStoryCategory =
  | 'job'
  | 'internship'
  | 'hackathon'
  | 'certification'
  | 'project'
  | 'scholarship'
  | 'freelancing'
  | 'business'
  | 'academic'
  | 'other';

export interface SuccessStoryCategoryDef {
  value: SuccessStoryCategory;
  label: string;
  /** Short hint shown in the achievement form. */
  hint: string;
}

export const SUCCESS_STORY_CATEGORIES: readonly SuccessStoryCategoryDef[] = [
  { value: 'job', label: 'Got a Job', hint: 'e.g. Junior Software Engineer at a software house' },
  { value: 'internship', label: 'Secured an Internship', hint: 'e.g. 3-month Web Development internship' },
  { value: 'hackathon', label: 'Won a Hackathon', hint: 'e.g. 1st place at a national hackathon' },
  { value: 'certification', label: 'Earned a Certification', hint: 'e.g. Google IT Support Certificate' },
  { value: 'project', label: 'Built a Real-World Project', hint: 'e.g. an e-commerce store for a real client' },
  { value: 'scholarship', label: 'Received a Scholarship', hint: 'e.g. merit scholarship for further study' },
  { value: 'freelancing', label: 'Started Freelancing', hint: 'e.g. first paid client on Upwork / Fiverr' },
  { value: 'business', label: 'Started a Business or Startup', hint: 'e.g. launched your own software agency' },
  { value: 'academic', label: 'Academic Achievement', hint: 'e.g. top position in university / GPA' },
  { value: 'other', label: 'Other Achievement', hint: 'Anything else you are proud of' },
] as const;

export const SUCCESS_STORY_CATEGORY_VALUES: readonly string[] = SUCCESS_STORY_CATEGORIES.map(
  (c) => c.value,
);

export function isSuccessStoryCategory(value: unknown): value is SuccessStoryCategory {
  return typeof value === 'string' && (SUCCESS_STORY_CATEGORY_VALUES as readonly string[]).includes(value);
}

export function successStoryCategoryLabel(value: string): string {
  return SUCCESS_STORY_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

/** Review workflow statuses for a success story submission. */
export type SuccessStoryStatus = 'pending' | 'under_review' | 'approved' | 'rejected';

export const SUCCESS_STORY_STATUSES: readonly SuccessStoryStatus[] = [
  'pending',
  'under_review',
  'approved',
  'rejected',
] as const;

export function isSuccessStoryStatus(value: unknown): value is SuccessStoryStatus {
  return (
    typeof value === 'string' &&
    (SUCCESS_STORY_STATUSES as readonly string[]).includes(value)
  );
}

export const SUCCESS_STORY_STATUS_LABELS: Record<SuccessStoryStatus, string> = {
  pending: 'Pending',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
};
