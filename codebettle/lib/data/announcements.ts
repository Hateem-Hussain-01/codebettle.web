export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'site-wide' | 'course';
  courseId?: string;
  authorId: string;
  createdAt: string;
  isActive: boolean;
}

export const announcements: Announcement[] = [
  { id: 'ann-1', title: 'Welcome to CodeBettle Platform!', content: 'We are excited to launch our new learning platform. Explore hundreds of courses and start your coding journey today!', type: 'site-wide', authorId: 'admin-1', createdAt: '2024-01-01', isActive: true },
  { id: 'ann-2', title: 'New Courses Added This Month', content: 'Check out our latest courses in React Native, DevOps, and SQL. Enroll now and get ahead in your tech career.', type: 'site-wide', authorId: 'admin-1', createdAt: '2024-05-01', isActive: true },
  { id: 'ann-3', title: 'Platform Maintenance — June 15', content: 'The platform will be down for maintenance on June 15, 2024 from 2:00 AM to 4:00 AM PKT.', type: 'site-wide', authorId: 'admin-2', createdAt: '2024-06-10', isActive: true },
  { id: 'ann-4', title: 'New Lesson Added: TypeScript Advanced Types', content: 'I have added a new lesson covering advanced TypeScript patterns. Check it out in Module 2!', type: 'course', courseId: 'course-1', authorId: 'inst-1', createdAt: '2024-05-20', isActive: true },
  { id: 'ann-5', title: 'Assignment Due This Week', content: 'Please complete the Flutter weather app assignment by Friday. Submit your GitHub repo link.', type: 'course', courseId: 'course-2', authorId: 'inst-2', createdAt: '2024-05-28', isActive: true },
];

export function getSiteWideAnnouncements() {
  return announcements.filter(a => a.type === 'site-wide' && a.isActive);
}

export function getCourseAnnouncements(courseId: string) {
  return announcements.filter(a => a.courseId === courseId && a.isActive);
}
