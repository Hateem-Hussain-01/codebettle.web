export interface Testimonial {
  id: string;
  studentName: string;
  studentAvatar: string;
  courseTitle: string;
  rating: number;
  comment: string;
  date: string;
}

export const testimonials: Testimonial[] = [
  { id: 't1', studentName: 'Ali Raza', studentAvatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Ali+Raza&backgroundColor=1C1C1C&textColor=F5C518', courseTitle: 'Complete React & Next.js Mastery', rating: 5, comment: 'This course completely changed my career. The instructor explains everything clearly and the projects are real-world. Got a job 2 months after completing!', date: '2024-04-05' },
  { id: 't2', studentName: 'Ayesha Siddiqui', studentAvatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Ayesha+Siddiqui&backgroundColor=1C1C1C&textColor=F5C518', courseTitle: 'Flutter Mobile App Development', rating: 5, comment: 'Best Flutter course I have found! The instructor walks you through everything step by step. Published my first app to Play Store!', date: '2024-04-20' },
  { id: 't3', studentName: 'Omar Farooq', studentAvatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Omar+Farooq&backgroundColor=1C1C1C&textColor=F5C518', courseTitle: 'Python for Data Science & ML', rating: 5, comment: 'Incredible depth and quality. I went from knowing basic Python to building ML models. The hands-on projects make all the difference.', date: '2024-05-10' },
  { id: 't4', studentName: 'Maryam Noor', studentAvatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Maryam+Noor&backgroundColor=1C1C1C&textColor=F5C518', courseTitle: 'UI/UX Design with Figma', rating: 4, comment: 'Great course for beginners! I had zero design experience and now I can create professional UI mockups. The free access is amazing.', date: '2024-05-15' },
  { id: 't5', studentName: 'Hamza Sheikh', studentAvatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Hamza+Sheikh&backgroundColor=1C1C1C&textColor=F5C518', courseTitle: 'Docker & Kubernetes for DevOps', rating: 5, comment: 'Extremely practical course. I use everything I learned here at my job every single day. Worth every rupee!', date: '2024-05-25' },
  { id: 't6', studentName: 'Sana Javed', studentAvatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Sana+Javed&backgroundColor=1C1C1C&textColor=F5C518', courseTitle: 'Node.js & Express Backend', rating: 4, comment: 'Really comprehensive backend course. Loved the API design section. Would love to see more about GraphQL added!', date: '2024-06-01' },
];
