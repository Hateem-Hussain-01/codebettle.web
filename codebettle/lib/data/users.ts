export type UserRole = 'student' | 'instructor' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  avatar?: string;
  bio?: string;
  phone?: string;
  expertise?: string[];
  socialLinks?: { github?: string; linkedin?: string; twitter?: string; website?: string };
  status: 'active' | 'suspended';
  joinedAt: string;
  enrolledCourses?: string[];
  wishlist?: string[];
}

export const users: User[] = [
  // Admins
  {
    id: 'admin-1',
    name: 'Ahmad Hassan',
    email: 'admin@codebettle.com',
    passwordHash: '$2b$12$CeiswGnI82IF1zhbhlqEDu.sXnOO5qJk5XAARXORXiGpqzhfMcpb6',
    role: 'admin',
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Ahmad+Hassan&backgroundColor=F5C518&textColor=111111',
    status: 'active',
    joinedAt: '2023-01-01',
  },
  {
    id: 'admin-2',
    name: 'Sara Khan',
    email: 'sara@codebettle.com',
    passwordHash: '$2b$12$CeiswGnI82IF1zhbhlqEDu.sXnOO5qJk5XAARXORXiGpqzhfMcpb6',
    role: 'admin',
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Sara+Khan&backgroundColor=F5C518&textColor=111111',
    status: 'active',
    joinedAt: '2023-01-15',
  },
  // Instructors
  {
    id: 'inst-1',
    name: 'Usman Ali',
    email: 'usman@codebettle.com',
    passwordHash: '$2b$12$PWgnrUgbriievwTtFYSmL.Lje8MdbLQonjTgVSoCJGiQjFVp2OfsS',
    role: 'instructor',
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Usman+Ali&backgroundColor=1C1C1C&textColor=F5C518',
    bio: 'Full-stack developer with 8+ years of experience in React, Node.js, and cloud technologies.',
    expertise: ['React', 'Node.js', 'TypeScript', 'AWS'],
    socialLinks: { github: 'https://github.com', linkedin: 'https://linkedin.com' },
    status: 'active',
    joinedAt: '2023-02-01',
  },
  {
    id: 'inst-2',
    name: 'Fatima Malik',
    email: 'fatima@codebettle.com',
    passwordHash: '$2b$12$PWgnrUgbriievwTtFYSmL.Lje8MdbLQonjTgVSoCJGiQjFVp2OfsS',
    role: 'instructor',
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Fatima+Malik&backgroundColor=1C1C1C&textColor=F5C518',
    bio: 'Mobile developer specializing in Flutter and React Native. Built 20+ production apps.',
    expertise: ['Flutter', 'React Native', 'Dart', 'Firebase'],
    socialLinks: { github: 'https://github.com', linkedin: 'https://linkedin.com' },
    status: 'active',
    joinedAt: '2023-02-15',
  },
  {
    id: 'inst-3',
    name: 'Bilal Ahmed',
    email: 'bilal@codebettle.com',
    passwordHash: '$2b$12$PWgnrUgbriievwTtFYSmL.Lje8MdbLQonjTgVSoCJGiQjFVp2OfsS',
    role: 'instructor',
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Bilal+Ahmed&backgroundColor=1C1C1C&textColor=F5C518',
    bio: 'Data scientist and ML engineer with expertise in Python, TensorFlow, and big data.',
    expertise: ['Python', 'Machine Learning', 'TensorFlow', 'SQL'],
    socialLinks: { github: 'https://github.com', linkedin: 'https://linkedin.com' },
    status: 'active',
    joinedAt: '2023-03-01',
  },
  {
    id: 'inst-4',
    name: 'Zainab Raza',
    email: 'zainab@codebettle.com',
    passwordHash: '$2b$12$PWgnrUgbriievwTtFYSmL.Lje8MdbLQonjTgVSoCJGiQjFVp2OfsS',
    role: 'instructor',
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Zainab+Raza&backgroundColor=1C1C1C&textColor=F5C518',
    bio: 'UI/UX designer and frontend developer passionate about creating beautiful experiences.',
    expertise: ['Figma', 'UI/UX', 'CSS', 'Tailwind'],
    socialLinks: { github: 'https://github.com', linkedin: 'https://linkedin.com' },
    status: 'active',
    joinedAt: '2023-03-15',
  },
  {
    id: 'inst-5',
    name: 'Hassan Mirza',
    email: 'hassan.m@codebettle.com',
    passwordHash: '$2b$12$PWgnrUgbriievwTtFYSmL.Lje8MdbLQonjTgVSoCJGiQjFVp2OfsS',
    role: 'instructor',
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Hassan+Mirza&backgroundColor=1C1C1C&textColor=F5C518',
    bio: 'DevOps engineer with expertise in Docker, Kubernetes, and CI/CD pipelines.',
    expertise: ['Docker', 'Kubernetes', 'CI/CD', 'Linux'],
    status: 'active',
    joinedAt: '2023-04-01',
  },
  // Students
  ...Array.from({ length: 20 }, (_, i) => {
    const names = [
      'Ali Raza', 'Ayesha Siddiqui', 'Omar Farooq', 'Maryam Noor', 'Hamza Sheikh',
      'Sana Javed', 'Tariq Mahmood', 'Hira Baig', 'Asad Khan', 'Nadia Iqbal',
      'Kamran Arif', 'Rabia Qureshi', 'Imran Haider', 'Saima Butt', 'Faisal Mehmood',
      'Amna Zahid', 'Shahid Hussain', 'Mehwish Chaudhry', 'Waseem Akhtar', 'Uzma Nawaz',
    ];
    const name = names[i];
    return {
      id: `student-${i + 1}`,
      name,
      email: `${name.toLowerCase().replace(' ', '.')}@gmail.com`,
      passwordHash: '$2b$12$Tu75TZnipoukQcyzcZ8k5uvHc/LZ0gTAwvKVnMkS8qSIHl17NEJyK',
      role: 'student' as UserRole,
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=1C1C1C&textColor=F5C518`,
      status: i < 18 ? 'active' as const : 'suspended' as const,
      joinedAt: `2024-0${Math.floor(i / 4) + 1}-${String((i % 4) * 7 + 1).padStart(2, '0')}`,
      enrolledCourses: i < 10 ? [`course-${(i % 8) + 1}`, `course-${((i + 2) % 8) + 1}`] : [`course-${(i % 8) + 1}`],
      wishlist: [`course-${((i + 3) % 8) + 1}`],
    };
  }),
];

export function getUserByEmail(email: string) {
  return users.find(u => u.email === email);
}

export function getUserById(id: string) {
  return users.find(u => u.id === id);
}

export function getStudents() {
  return users.filter(u => u.role === 'student');
}

export function getInstructors() {
  return users.filter(u => u.role === 'instructor');
}
