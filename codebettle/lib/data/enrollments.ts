export interface Enrollment {
  id: string;
  studentId: string;
  courseId: string;
  enrolledAt: string;
  completedLessons: string[];
  isCompleted: boolean;
  completedAt?: string;
  paymentStatus: 'paid' | 'free' | 'pending';
  couponUsed?: string;
  amountPaid: number;
  // Set by instructor when marking course complete
  certificateEligible?: boolean;   // true = eligible, false = not eligible, undefined = not yet evaluated
}

export const enrollments: Enrollment[] = [
  { id: 'enr-1', studentId: 'student-1', courseId: 'course-1', enrolledAt: '2024-01-20', completedLessons: ['les-1-1-1', 'les-1-1-2', 'les-1-1-3', 'les-1-2-1'], isCompleted: false, paymentStatus: 'paid', amountPaid: 4999 },
  { id: 'enr-2', studentId: 'student-1', courseId: 'course-3', enrolledAt: '2024-02-10', completedLessons: ['les-3-1-1', 'les-3-1-2', 'les-3-2-1', 'les-3-2-2'], isCompleted: true, completedAt: '2024-04-01', paymentStatus: 'paid', amountPaid: 5999 },
  { id: 'enr-3', studentId: 'student-2', courseId: 'course-2', enrolledAt: '2024-02-15', completedLessons: ['les-2-1-1', 'les-2-1-2'], isCompleted: false, paymentStatus: 'paid', amountPaid: 3999 },
  { id: 'enr-4', studentId: 'student-2', courseId: 'course-4', enrolledAt: '2024-03-01', completedLessons: ['les-4-1-1', 'les-4-1-2', 'les-4-2-1', 'les-4-2-2'], isCompleted: true, completedAt: '2024-04-15', paymentStatus: 'free', amountPaid: 0 },
  { id: 'enr-5', studentId: 'student-3', courseId: 'course-3', enrolledAt: '2024-02-20', completedLessons: ['les-3-1-1'], isCompleted: false, paymentStatus: 'paid', amountPaid: 5999 },
  { id: 'enr-6', studentId: 'student-3', courseId: 'course-5', enrolledAt: '2024-03-05', completedLessons: ['les-5-1-1', 'les-5-1-2'], isCompleted: false, paymentStatus: 'paid', amountPaid: 6999 },
  { id: 'enr-7', studentId: 'student-4', courseId: 'course-4', enrolledAt: '2024-03-10', completedLessons: ['les-4-1-1', 'les-4-1-2', 'les-4-2-1', 'les-4-2-2'], isCompleted: true, completedAt: '2024-05-01', paymentStatus: 'free', amountPaid: 0 },
  { id: 'enr-8', studentId: 'student-4', courseId: 'course-6', enrolledAt: '2024-04-01', completedLessons: ['les-6-1-1'], isCompleted: false, paymentStatus: 'paid', amountPaid: 4499 },
  { id: 'enr-9', studentId: 'student-5', courseId: 'course-1', enrolledAt: '2024-01-25', completedLessons: ['les-1-1-1', 'les-1-1-2', 'les-1-1-3', 'les-1-2-1', 'les-1-2-2', 'les-1-3-1', 'les-1-3-2'], isCompleted: true, completedAt: '2024-03-20', paymentStatus: 'paid', amountPaid: 4999 },
  { id: 'enr-10', studentId: 'student-5', courseId: 'course-7', enrolledAt: '2024-04-10', completedLessons: [], isCompleted: false, paymentStatus: 'paid', amountPaid: 4999 },
  { id: 'enr-11', studentId: 'student-6', courseId: 'course-8', enrolledAt: '2024-05-01', completedLessons: ['les-8-1-1'], isCompleted: false, paymentStatus: 'free', amountPaid: 0 },
  { id: 'enr-12', studentId: 'student-6', courseId: 'course-2', enrolledAt: '2024-05-05', completedLessons: ['les-2-1-1', 'les-2-1-2', 'les-2-2-1', 'les-2-2-2'], isCompleted: true, completedAt: '2024-06-01', paymentStatus: 'paid', amountPaid: 3999 },
  { id: 'enr-13', studentId: 'student-7', courseId: 'course-3', enrolledAt: '2024-03-20', completedLessons: ['les-3-1-1', 'les-3-1-2'], isCompleted: false, paymentStatus: 'paid', amountPaid: 5999 },
  { id: 'enr-14', studentId: 'student-7', courseId: 'course-4', enrolledAt: '2024-04-20', completedLessons: ['les-4-1-1', 'les-4-1-2', 'les-4-2-1', 'les-4-2-2'], isCompleted: true, completedAt: '2024-05-15', paymentStatus: 'free', amountPaid: 0 },
  { id: 'enr-15', studentId: 'student-8', courseId: 'course-1', enrolledAt: '2024-02-01', completedLessons: ['les-1-1-1', 'les-1-1-2'], isCompleted: false, paymentStatus: 'paid', amountPaid: 4999 },
];

export function getEnrollmentsByStudent(studentId: string) {
  return enrollments.filter(e => e.studentId === studentId);
}

export function getEnrollmentsByCourse(courseId: string) {
  return enrollments.filter(e => e.courseId === courseId);
}

export function isEnrolled(studentId: string, courseId: string) {
  return enrollments.some(e => e.studentId === studentId && e.courseId === courseId);
}

export function getCompletedEnrollments(studentId: string) {
  return enrollments.filter(e => e.studentId === studentId && e.isCompleted);
}
