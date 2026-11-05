export interface Review {
  id: string;
  studentId: string;
  courseId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export const reviews: Review[] = [
  { id: 'rev-1', studentId: 'student-1', courseId: 'course-3', rating: 5, comment: 'Incredible course! Went from Python basics to building real ML models. Bilal is an amazing teacher.', createdAt: '2024-04-05' },
  { id: 'rev-2', studentId: 'student-2', courseId: 'course-4', rating: 4, comment: 'Great Figma course for beginners. Clear explanations and good projects. Would love more real-world case studies.', createdAt: '2024-04-20' },
  { id: 'rev-3', studentId: 'student-4', courseId: 'course-4', rating: 5, comment: 'Best free design course available anywhere. Zainab explains design principles beautifully.', createdAt: '2024-05-05' },
  { id: 'rev-4', studentId: 'student-5', courseId: 'course-1', rating: 5, comment: 'This course got me my first developer job. The Next.js section is gold.', createdAt: '2024-03-25' },
  { id: 'rev-5', studentId: 'student-6', courseId: 'course-2', rating: 4, comment: 'Really enjoyed this Flutter course. Published my first app after completing it!', createdAt: '2024-06-03' },
  { id: 'rev-6', studentId: 'student-7', courseId: 'course-4', rating: 4, comment: 'Loved the color theory and typography sections. Very practical content.', createdAt: '2024-05-18' },
];

export function getReviewsByCourse(courseId: string) {
  return reviews.filter(r => r.courseId === courseId);
}

export function getReviewsByStudent(studentId: string) {
  return reviews.filter(r => r.studentId === studentId);
}
