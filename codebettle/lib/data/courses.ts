export type CourseLevel = 'beginner' | 'intermediate' | 'advanced';
export type CourseStatus = 'draft' | 'published' | 'archived';
export type CourseCategory = 'Web Development' | 'Mobile Development' | 'Data Science' | 'UI/UX Design' | 'DevOps' | 'Programming';
export type ScheduleType = 'weekdays' | 'weekends' | 'whole-week' | 'custom';

export interface ClassSession {
  id: string;
  title: string;
  description: string;
  date: string;
  driveRecordingUrl: string;
  materials: { name: string; url: string }[];
  duration: string;
}

export interface Module {
  id: string;
  title: string;
  lessons: ClassSession[];
}

export interface CourseSchedule {
  classTime: string;           // e.g. “7:00 PM”
  classDuration: string;       // e.g. “1.5 hours”
  scheduleType: ScheduleType;
  customDays?: string[];       // ['Monday', 'Wednesday', 'Friday']
  startDate: string;
  notes?: string;
}

export interface InstructorReview {
  rating: number;
  comment: string;
  submittedAt: string;
}

export interface Course {
  id: string;
  slug: string;
  title: string;
  description: string;
  longDescription: string;
  thumbnail: string;
  category: CourseCategory;
  level: CourseLevel;
  price: number;
  isFree: boolean;
  instructorId: string;
  zoomLink: string;
  schedule?: CourseSchedule;
  status: CourseStatus;
  isFeatured: boolean;
  isCompleted: boolean;
  completedAt?: string;
  instructorPrivateReview?: InstructorReview;   // only admin sees
  instructorClassReview?: InstructorReview;      // admin + enrolled students see
  modules: Module[];
  requirements: string[];
  whatYouLearn: string[];
  tags: string[];
  enrolledCount: number;
  rating: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
}

export const courses: Course[] = [
  {
    id: 'course-1',
    slug: 'complete-react-nextjs-course',
    title: 'Complete React & Next.js Mastery',
    description: 'Master React and Next.js from scratch to advanced. Build real-world projects.',
    longDescription: 'This comprehensive course covers everything you need to become a proficient React and Next.js developer. Starting from the fundamentals of React components, hooks, and state management, you will progress to building full-stack applications with Next.js, API routes, authentication, and deployment.',
    thumbnail: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800&q=80',
    category: 'Web Development',
    level: 'intermediate',
    price: 4999,
    isFree: false,
    instructorId: 'inst-1',
    zoomLink: 'https://zoom.us/j/1234567890',
    status: 'published',
    isFeatured: true,
    isCompleted: false,
    requirements: ['Basic HTML & CSS knowledge', 'JavaScript fundamentals', 'A computer with internet'],
    whatYouLearn: ['React hooks and state management', 'Next.js App Router', 'TypeScript integration', 'REST APIs & databases', 'Authentication & authorization', 'Deployment on Vercel'],
    tags: ['React', 'Next.js', 'TypeScript', 'Web Dev'],
    enrolledCount: 342,
    rating: 4.8,
    reviewCount: 87,
    createdAt: '2024-01-15',
    updatedAt: '2024-05-20',
    modules: [
      {
        id: 'mod-1-1',
        title: 'React Fundamentals',
        lessons: [
          { id: 'les-1-1-1', title: 'Introduction to React', description: 'What is React and why use it?', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example1', materials: [{ name: 'React Intro Slides.pdf', url: '#' }], duration: '45 min' },
          { id: 'les-1-1-2', title: 'JSX and Components', description: 'Understanding JSX syntax and component creation', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example2', materials: [], duration: '50 min' },
          { id: 'les-1-1-3', title: 'Props and State', description: 'Data flow in React applications', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example3', materials: [{ name: 'Props Exercise.zip', url: '#' }], duration: '60 min' },
        ],
      },
      {
        id: 'mod-1-2',
        title: 'React Hooks Deep Dive',
        lessons: [
          { id: 'les-1-2-1', title: 'useState and useEffect', description: 'Core hooks every React developer must know', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example4', materials: [], duration: '55 min' },
          { id: 'les-1-2-2', title: 'useContext and Custom Hooks', description: 'Share state across components', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example5', materials: [{ name: 'Hooks Cheatsheet.pdf', url: '#' }], duration: '65 min' },
        ],
      },
      {
        id: 'mod-1-3',
        title: 'Next.js App Router',
        lessons: [
          { id: 'les-1-3-1', title: 'Next.js Project Setup', description: 'Setting up a Next.js project with App Router', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example6', materials: [], duration: '40 min' },
          { id: 'les-1-3-2', title: 'Server and Client Components', description: 'Understanding the rendering model', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example7', materials: [{ name: 'Server Components Guide.pdf', url: '#' }], duration: '70 min' },
        ],
      },
    ],
  },
  {
    id: 'course-2',
    slug: 'flutter-mobile-development',
    title: 'Flutter Mobile App Development',
    description: 'Build beautiful cross-platform mobile apps with Flutter and Dart from zero to hero.',
    longDescription: 'Learn Flutter and Dart to build stunning iOS and Android apps from a single codebase. This course covers widgets, state management, Firebase integration, and publishing to app stores.',
    thumbnail: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800&q=80',
    category: 'Mobile Development',
    level: 'beginner',
    price: 3999,
    isFree: false,
    instructorId: 'inst-2',
    zoomLink: 'https://zoom.us/j/1234567890',
    status: 'published',
    isFeatured: true,
    isCompleted: false,
    requirements: ['Basic programming knowledge', 'No prior mobile experience needed'],
    whatYouLearn: ['Dart programming language', 'Flutter widgets & layouts', 'State management with Provider & Riverpod', 'Firebase backend', 'Publishing to App Store & Play Store'],
    tags: ['Flutter', 'Dart', 'Mobile', 'Firebase'],
    enrolledCount: 218,
    rating: 4.7,
    reviewCount: 54,
    createdAt: '2024-02-01',
    updatedAt: '2024-05-15',
    modules: [
      {
        id: 'mod-2-1',
        title: 'Dart Fundamentals',
        lessons: [
          { id: 'les-2-1-1', title: 'Dart Basics', description: 'Variables, types, and control flow', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example', materials: [{ name: 'Dart Quick Reference.pdf', url: '#' }], duration: '50 min' },
          { id: 'les-2-1-2', title: 'OOP in Dart', description: 'Classes, inheritance, and mixins', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example', materials: [], duration: '55 min' },
        ],
      },
      {
        id: 'mod-2-2',
        title: 'Flutter Widgets',
        lessons: [
          { id: 'les-2-2-1', title: 'Stateless vs Stateful Widgets', description: 'Core building blocks of Flutter UI', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example', materials: [], duration: '60 min' },
          { id: 'les-2-2-2', title: 'Layouts and Navigation', description: 'Row, Column, Stack and routing', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example', materials: [{ name: 'Layout Examples.zip', url: '#' }], duration: '65 min' },
        ],
      },
    ],
  },
  {
    id: 'course-3',
    slug: 'python-machine-learning',
    title: 'Python for Data Science & Machine Learning',
    description: 'Master Python, pandas, NumPy, and scikit-learn to build real ML models.',
    longDescription: 'A complete journey through data science and machine learning with Python. From data wrangling with pandas to building and deploying ML models with scikit-learn and TensorFlow.',
    thumbnail: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80',
    category: 'Data Science',
    level: 'intermediate',
    price: 5999,
    isFree: false,
    instructorId: 'inst-3',
    zoomLink: 'https://zoom.us/j/1234567890',
    status: 'published',
    isFeatured: true,
    isCompleted: false,
    requirements: ['Basic Python knowledge', 'High school math'],
    whatYouLearn: ['Python for data analysis', 'Pandas and NumPy', 'Data visualization', 'Machine learning algorithms', 'Neural networks with TensorFlow', 'Model deployment'],
    tags: ['Python', 'ML', 'Data Science', 'TensorFlow'],
    enrolledCount: 189,
    rating: 4.9,
    reviewCount: 72,
    createdAt: '2024-02-15',
    updatedAt: '2024-06-01',
    modules: [
      {
        id: 'mod-3-1',
        title: 'Python Data Tools',
        lessons: [
          { id: 'les-3-1-1', title: 'NumPy Essentials', description: 'Arrays and numerical computing', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example', materials: [{ name: 'NumPy Cheatsheet.pdf', url: '#' }], duration: '55 min' },
          { id: 'les-3-1-2', title: 'Pandas for Data Wrangling', description: 'DataFrames and data manipulation', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example', materials: [{ name: 'Dataset.csv', url: '#' }], duration: '70 min' },
        ],
      },
      {
        id: 'mod-3-2',
        title: 'Machine Learning Algorithms',
        lessons: [
          { id: 'les-3-2-1', title: 'Linear & Logistic Regression', description: 'Supervised learning fundamentals', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example', materials: [], duration: '80 min' },
          { id: 'les-3-2-2', title: 'Decision Trees & Random Forest', description: 'Ensemble methods', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example', materials: [], duration: '75 min' },
        ],
      },
    ],
  },
  {
    id: 'course-4',
    slug: 'ui-ux-design-figma',
    title: 'UI/UX Design with Figma',
    description: 'Learn modern UI/UX design principles and Figma from scratch. Build a portfolio.',
    longDescription: 'This course teaches you everything you need to know to become a UI/UX designer. From design theory and user research to prototyping and developer handoff using Figma.',
    thumbnail: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800&q=80',
    category: 'UI/UX Design',
    level: 'beginner',
    price: 0,
    isFree: true,
    instructorId: 'inst-4',
    zoomLink: 'https://zoom.us/j/1234567890',
    status: 'published',
    isFeatured: true,
    isCompleted: false,
    requirements: ['No design experience needed', 'A computer with internet access'],
    whatYouLearn: ['Design principles and theory', 'Figma from scratch', 'Wireframing and prototyping', 'User research methods', 'Building a design portfolio'],
    tags: ['Figma', 'UI/UX', 'Design', 'Prototyping'],
    enrolledCount: 521,
    rating: 4.6,
    reviewCount: 143,
    createdAt: '2024-03-01',
    updatedAt: '2024-05-28',
    modules: [
      {
        id: 'mod-4-1',
        title: 'Design Fundamentals',
        lessons: [
          { id: 'les-4-1-1', title: 'Color Theory', description: 'Understanding colors in design', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example', materials: [{ name: 'Color Wheel.pdf', url: '#' }], duration: '40 min' },
          { id: 'les-4-1-2', title: 'Typography', description: 'Fonts and typographic hierarchy', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example', materials: [], duration: '45 min' },
        ],
      },
      {
        id: 'mod-4-2',
        title: 'Figma Masterclass',
        lessons: [
          { id: 'les-4-2-1', title: 'Figma Interface Tour', description: 'Getting started with Figma', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example', materials: [], duration: '35 min' },
          { id: 'les-4-2-2', title: 'Auto Layout & Components', description: 'Building reusable design systems', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example', materials: [{ name: 'Figma Template.fig', url: '#' }], duration: '60 min' },
        ],
      },
    ],
  },
  {
    id: 'course-5',
    slug: 'docker-kubernetes-devops',
    title: 'Docker & Kubernetes for DevOps',
    description: 'Master containerization and orchestration with Docker and Kubernetes.',
    longDescription: 'Learn DevOps best practices by mastering Docker for containerization and Kubernetes for orchestration. Build and deploy scalable applications in the cloud.',
    thumbnail: 'https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?w=800&q=80',
    category: 'DevOps',
    level: 'advanced',
    price: 6999,
    isFree: false,
    instructorId: 'inst-5',
    zoomLink: 'https://zoom.us/j/1234567890',
    status: 'published',
    isFeatured: false,
    isCompleted: false,
    requirements: ['Linux command line basics', 'Experience with any programming language'],
    whatYouLearn: ['Docker containers and images', 'Docker Compose', 'Kubernetes architecture', 'Helm charts', 'CI/CD with GitHub Actions'],
    tags: ['Docker', 'Kubernetes', 'DevOps', 'CI/CD'],
    enrolledCount: 98,
    rating: 4.7,
    reviewCount: 31,
    createdAt: '2024-03-15',
    updatedAt: '2024-06-01',
    modules: [
      {
        id: 'mod-5-1',
        title: 'Docker Fundamentals',
        lessons: [
          { id: 'les-5-1-1', title: 'Containers vs VMs', description: 'Understanding containerization', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example', materials: [], duration: '45 min' },
          { id: 'les-5-1-2', title: 'Building Docker Images', description: 'Dockerfile and image layers', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example', materials: [{ name: 'Dockerfile Examples.zip', url: '#' }], duration: '60 min' },
        ],
      },
    ],
  },
  {
    id: 'course-6',
    slug: 'node-express-backend',
    title: 'Node.js & Express Backend Development',
    description: 'Build robust REST APIs and backend services with Node.js, Express, and MongoDB.',
    longDescription: 'A complete backend development course using Node.js and Express. Learn to build RESTful APIs, handle authentication with JWT, work with MongoDB and Mongoose, and deploy to the cloud.',
    thumbnail: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80',
    category: 'Web Development',
    level: 'intermediate',
    price: 4499,
    isFree: false,
    instructorId: 'inst-1',
    zoomLink: 'https://zoom.us/j/1234567890',
    status: 'published',
    isFeatured: false,
    isCompleted: false,
    requirements: ['JavaScript basics', 'Basic understanding of HTTP'],
    whatYouLearn: ['Node.js runtime', 'Express framework', 'RESTful API design', 'MongoDB with Mongoose', 'JWT Authentication', 'Error handling'],
    tags: ['Node.js', 'Express', 'MongoDB', 'API'],
    enrolledCount: 156,
    rating: 4.5,
    reviewCount: 48,
    createdAt: '2024-04-01',
    updatedAt: '2024-05-30',
    modules: [
      {
        id: 'mod-6-1',
        title: 'Node.js Essentials',
        lessons: [
          { id: 'les-6-1-1', title: 'Node.js Architecture', description: 'Event loop and async model', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example', materials: [], duration: '50 min' },
          { id: 'les-6-1-2', title: 'Modules and NPM', description: 'CommonJS modules and package management', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example', materials: [], duration: '45 min' },
        ],
      },
    ],
  },
  {
    id: 'course-7',
    slug: 'react-native-mobile',
    title: 'React Native â€” Cross-Platform Apps',
    description: 'Use your React skills to build mobile apps for iOS and Android with React Native.',
    longDescription: 'If you know React, you can build mobile apps! This course teaches React Native from scratch, covering navigation, native modules, animations, and publishing to app stores.',
    thumbnail: 'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=800&q=80',
    category: 'Mobile Development',
    level: 'intermediate',
    price: 4999,
    isFree: false,
    instructorId: 'inst-2',
    zoomLink: 'https://zoom.us/j/1234567890',
    status: 'published',
    isFeatured: false,
    isCompleted: false,
    requirements: ['React.js knowledge', 'Basic JavaScript/TypeScript'],
    whatYouLearn: ['React Native components', 'Navigation with Expo Router', 'Native device APIs', 'Push notifications', 'App store deployment'],
    tags: ['React Native', 'Mobile', 'Expo', 'iOS', 'Android'],
    enrolledCount: 134,
    rating: 4.6,
    reviewCount: 39,
    createdAt: '2024-04-15',
    updatedAt: '2024-06-01',
    modules: [
      {
        id: 'mod-7-1',
        title: 'React Native Basics',
        lessons: [
          { id: 'les-7-1-1', title: 'Setup and First App', description: 'Getting started with Expo', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example', materials: [], duration: '40 min' },
        ],
      },
    ],
  },
  {
    id: 'course-8',
    slug: 'sql-database-design',
    title: 'SQL & Database Design Masterclass',
    description: 'Learn SQL from basics to advanced. Database design, optimization, and administration.',
    longDescription: 'Master SQL and relational database design. This course covers everything from basic SELECT queries to advanced topics like indexing, stored procedures, transactions, and database design patterns.',
    thumbnail: 'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=800&q=80',
    category: 'Programming',
    level: 'beginner',
    price: 0,
    isFree: true,
    instructorId: 'inst-3',
    zoomLink: 'https://zoom.us/j/1234567890',
    status: 'published',
    isFeatured: false,
    isCompleted: false,
    requirements: ['No prior database experience needed'],
    whatYouLearn: ['SQL syntax and queries', 'Database design and normalization', 'Joins and subqueries', 'Indexes and optimization', 'PostgreSQL and MySQL'],
    tags: ['SQL', 'Database', 'PostgreSQL', 'MySQL'],
    enrolledCount: 287,
    rating: 4.4,
    reviewCount: 91,
    createdAt: '2024-05-01',
    updatedAt: '2024-06-01',
    modules: [
      {
        id: 'mod-8-1',
        title: 'SQL Basics',
        lessons: [
          { id: 'les-8-1-1', title: 'SELECT Queries', description: 'Retrieving data from tables', date: '2024-05-10', driveRecordingUrl: 'https://www.youtube.com/watch?v=example', materials: [{ name: 'SQL Cheatsheet.pdf', url: '#' }], duration: '45 min' },
        ],
      },
    ],
  },
];

export function getCourseBySlug(slug: string) {
  return courses.find(c => c.slug === slug);
}

export function getCourseById(id: string) {
  return courses.find(c => c.id === id);
}

export function getPublishedCourses() {
  return courses.filter(c => c.status === 'published');
}

export function getFeaturedCourses() {
  return courses.filter(c => c.isFeatured && c.status === 'published');
}

export function getCoursesByInstructor(instructorId: string) {
  return courses.filter(c => c.instructorId === instructorId);
}



