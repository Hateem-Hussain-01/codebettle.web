import type { UserRole } from './db/types';

/**
 * Role-based access control matrix (transformation plan §4).
 * Authorisation is enforced server-side: in route guards, in API routes,
 * and — from Phase 2 — per record in every query (ownership scoping).
 * The frontend only hides controls; it never grants access.
 */

export type Capability =
  | 'browseCatalogue'
  | 'enroll'
  | 'reviewOwnCourse'
  | 'viewOtherStudents'
  | 'createCourse'
  | 'editOwnCourse'
  | 'editAnyCourse'
  | 'publishCourse'
  | 'markCompletion'
  | 'proposeCertificate'
  | 'issueCertificate'
  | 'manageUsers'
  | 'manageCoupons'
  | 'manageSettings'
  | 'viewAuditLogs'
  | 'viewReports';

const MATRIX: Record<Capability, UserRole[]> = {
  browseCatalogue: ['student', 'instructor', 'admin'],
  enroll: ['student'],
  reviewOwnCourse: ['student'],
  viewOtherStudents: ['instructor', 'admin'], // instructors: own courses only (ownership check)
  createCourse: ['instructor', 'admin'],
  editOwnCourse: ['instructor'],
  editAnyCourse: ['admin'],
  publishCourse: ['admin'],
  markCompletion: ['instructor', 'admin'], // instructors: own courses only
  proposeCertificate: ['instructor'],
  issueCertificate: ['admin'],
  manageUsers: ['admin'],
  manageCoupons: ['admin'],
  manageSettings: ['admin'],
  viewAuditLogs: ['admin'],
  viewReports: ['admin'],
};

/** Does this role have this capability at all (before ownership checks)? */
export function can(role: UserRole, capability: Capability): boolean {
  return MATRIX[capability].includes(role);
}

/** Does the session user (if any) have one of the given roles? */
export function hasRole(
  session: { role: UserRole } | null,
  roles: UserRole[]
): boolean {
  return session !== null && roles.includes(session.role);
}

/** Ownership: an instructor may only touch courses they teach. */
export function ownsCourse(session: { id: string; role: UserRole } | null, instructorId: string): boolean {
  return session !== null && session.role === 'instructor' && session.id === instructorId;
}

/** Ownership: a student may only touch their own records. Admins may touch any. */
export function ownsEnrollment(
  session: { id: string; role: UserRole } | null,
  studentId: string
): boolean {
  if (session === null) return false;
  if (session.role === 'admin') return true;
  return session.role === 'student' && session.id === studentId;
}
