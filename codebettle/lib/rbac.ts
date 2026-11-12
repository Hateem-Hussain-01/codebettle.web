import type { UserRole } from './db/types';

/**
 * Role-based access control matrix (transformation plan §4).
 * Authorisation is enforced server-side: in route guards, in API routes,
 * and — from Phase 2 — per record in every query (ownership scoping).
 * The frontend only hides controls; it never grants access.
 *
 * Phase 2 — flags role model (user-confirmed): multi-role is boolean
 * on/off switches on the User record (`isAdmin`, `isTeacher`), NOT a
 * separate role table. `role` stays as the PRIMARY role (home portal /
 * landing portal). Semantics:
 * - A user is an admin iff `isAdmin` is true; a teacher iff `isTeacher`
 *   is true. Both flags can be true at once.
 * - A plain student is primary role `student` with both flags false.
 * - Capability checks MUST go through hasAdminCapability /
 *   hasTeacherCapability below, never `role === 'admin'` alone.
 * - TRANSITIONAL FALLBACK: the helpers also treat the legacy primary
 *   role as a capability (`role === 'admin'` counts as admin,
 *   `role === 'instructor'` as teacher). This is what keeps pre-flag
 *   rows — the seed, and any row created before the Phase 2 migration's
 *   backfill ran — working. Once the backfill has run everywhere, the
 *   flags and the primary role agree and the fallback is a no-op; do
 *   not remove it without a data check that every admin/teacher row
 *   carries its flag.
 * - Student-only flows (enrol, review, quiz attempts, payment submit)
 *   stay keyed to the PRIMARY role (`role === 'student'`): being a
 *   teacher or an admin does not make you a student.
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
  | 'viewReports'
  | 'verifyPayment'
  | 'managePaymentAccounts';

/** Anything that carries a primary role and/or the Phase 2 flags. */
export interface CapabilitySubject {
  role?: UserRole;
  isAdmin?: boolean;
  isTeacher?: boolean;
}

/** Admin capability: the isAdmin flag, or (transitional fallback) primary role admin. */
export function hasAdminCapability(
  user: CapabilitySubject | null | undefined,
): boolean {
  if (!user) return false;
  return user.isAdmin === true || user.role === 'admin';
}

/** Teacher capability: the isTeacher flag, or (transitional fallback) primary role instructor. */
export function hasTeacherCapability(
  user: CapabilitySubject | null | undefined,
): boolean {
  if (!user) return false;
  return user.isTeacher === true || user.role === 'instructor';
}

/** Student identity is the PRIMARY role only — flags never confer it. */
export function isStudent(user: CapabilitySubject | null | undefined): boolean {
  return user?.role === 'student';
}

/** The two portals on the sign-in page (Student | Instructor tabs). */
export type LoginPortal = 'student' | 'instructor';

/**
 * Login role-mismatch guard: does this account hold the capability the
 * sign-in tab asks for? Checked server-side in the login route AFTER
 * the password is verified — never before, so the result cannot be
 * used to enumerate accounts (a wrong password still returns the
 * generic invalid-credentials error).
 * - 'student' tab: the primary role must be student, OR the account
 *   is an admin. Admins sign in through this same page (there is no
 *   Admin tab), so admin capability passes BOTH tabs — otherwise
 *   admins would be locked out entirely.
 * - 'instructor' tab: the account must hold the teacher capability
 *   (isTeacher flag or legacy instructor role), OR be an admin.
 * - A user who is BOTH (primary role 'student' + isTeacher flag)
 *   passes either tab.
 */
export function matchesLoginPortal(
  user: CapabilitySubject | null | undefined,
  portal: LoginPortal,
): boolean {
  if (!user) return false;
  if (hasAdminCapability(user)) return true;
  return portal === 'student' ? isStudent(user) : hasTeacherCapability(user);
}

/**
 * The effective roles a subject acts with, for the capability matrix:
 * admin (flag or legacy role), instructor (flag or legacy role), and
 * student (primary role only). A teacher+admin therefore acts with both
 * admin and instructor capabilities; a pure admin does NOT gain
 * instructor-only capabilities (editOwnCourse, proposeCertificate)
 * unless they also hold the teacher flag.
 */
export function effectiveRoles(user: CapabilitySubject | null | undefined): UserRole[] {
  if (!user) return [];
  const roles: UserRole[] = [];
  if (hasAdminCapability(user)) roles.push('admin');
  if (hasTeacherCapability(user)) roles.push('instructor');
  if (user.role === 'student') roles.push('student');
  return roles;
}

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
  verifyPayment: ['admin'],
  managePaymentAccounts: ['admin'],
};

/**
 * Does this role / subject have this capability at all (before ownership
 * checks)? Accepts a bare primary role (legacy call sites) or a full
 * subject with flags. A bare role behaves exactly as before.
 */
export function can(role: UserRole, capability: Capability): boolean;
export function can(subject: CapabilitySubject, capability: Capability): boolean;
export function can(
  roleOrSubject: UserRole | CapabilitySubject,
  capability: Capability,
): boolean {
  if (typeof roleOrSubject === 'string') {
    return MATRIX[capability].includes(roleOrSubject);
  }
  return effectiveRoles(roleOrSubject).some((role) => MATRIX[capability].includes(role));
}

/** Does the session user (if any) have one of the given PRIMARY roles? Role-only on purpose — capability checks use hasAdminCapability / hasTeacherCapability. */
export function hasRole(
  session: { role: UserRole } | null,
  roles: UserRole[]
): boolean {
  return session !== null && roles.includes(session.role);
}

/** Ownership: a teacher (flag or legacy role) may only touch courses they teach. */
export function ownsCourse(session: { id: string; role: UserRole; isAdmin?: boolean; isTeacher?: boolean } | null, instructorId: string): boolean {
  return session !== null && hasTeacherCapability(session) && session.id === instructorId;
}

/** Ownership: a student may only touch their own records. Admins may touch any. */
export function ownsEnrollment(
  session: { id: string; role: UserRole; isAdmin?: boolean; isTeacher?: boolean } | null,
  studentId: string
): boolean {
  if (session === null) return false;
  if (hasAdminCapability(session)) return true;
  return session.role === 'student' && session.id === studentId;
}
