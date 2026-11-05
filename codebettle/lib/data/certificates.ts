export interface Certificate {
  id: string;
  studentId: string;
  courseId: string;
  enrollmentId: string;
  issuedAt: string;
  certificateNumber: string;
}

export const certificates: Certificate[] = [
  { id: 'cert-1', studentId: 'student-1', courseId: 'course-3', enrollmentId: 'enr-2', issuedAt: '2024-04-01', certificateNumber: 'CB-2024-001' },
  { id: 'cert-2', studentId: 'student-2', courseId: 'course-4', enrollmentId: 'enr-4', issuedAt: '2024-04-15', certificateNumber: 'CB-2024-002' },
  { id: 'cert-3', studentId: 'student-4', courseId: 'course-4', enrollmentId: 'enr-7', issuedAt: '2024-05-01', certificateNumber: 'CB-2024-003' },
  { id: 'cert-4', studentId: 'student-5', courseId: 'course-1', enrollmentId: 'enr-9', issuedAt: '2024-03-20', certificateNumber: 'CB-2024-004' },
  { id: 'cert-5', studentId: 'student-6', courseId: 'course-2', enrollmentId: 'enr-12', issuedAt: '2024-06-01', certificateNumber: 'CB-2024-005' },
  { id: 'cert-6', studentId: 'student-7', courseId: 'course-4', enrollmentId: 'enr-14', issuedAt: '2024-05-15', certificateNumber: 'CB-2024-006' },
];

export function getCertificatesByStudent(studentId: string) {
  return certificates.filter(c => c.studentId === studentId);
}

export function getCertificateByCourseAndStudent(courseId: string, studentId: string) {
  return certificates.find(c => c.courseId === courseId && c.studentId === studentId);
}
