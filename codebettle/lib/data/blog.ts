export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  thumbnail: string;
  category: string;
  authorId: string;
  authorName: string;
  publishedAt: string;
  isPublished: boolean;
  readTime: string;
  tags: string[];
}

export const blogPosts: BlogPost[] = [
  {
    id: 'blog-1',
    slug: 'top-10-react-hooks-2024',
    title: 'Top 10 React Hooks Every Developer Should Know in 2024',
    excerpt: 'From useState to custom hooks, here are the essential React hooks that will make you a better developer.',
    content: `React hooks have revolutionized how we write React components. Here are the 10 most important hooks you should master:\n\n**1. useState** — The foundation of all state management in functional components.\n\n**2. useEffect** — Handle side effects like API calls, subscriptions, and DOM manipulation.\n\n**3. useContext** — Consume React context without prop drilling.\n\n**4. useReducer** — Manage complex state logic with a reducer pattern.\n\n**5. useMemo** — Memoize expensive computations to optimize performance.\n\n**6. useCallback** — Memoize callback functions to prevent unnecessary re-renders.\n\n**7. useRef** — Access DOM elements and persist values between renders without causing re-renders.\n\n**8. useLayoutEffect** — Like useEffect, but fires synchronously after DOM mutations.\n\n**9. useId** — Generate unique IDs for accessibility attributes.\n\n**10. Custom Hooks** — Encapsulate reusable stateful logic for sharing across components.`,
    thumbnail: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800&q=80',
    category: 'React',
    authorId: 'inst-1',
    authorName: 'Usman Ali',
    publishedAt: '2024-05-15',
    isPublished: true,
    readTime: '8 min read',
    tags: ['React', 'Hooks', 'JavaScript'],
  },
  {
    id: 'blog-2',
    slug: 'flutter-vs-react-native-2024',
    title: 'Flutter vs React Native: Which Should You Choose in 2024?',
    excerpt: 'A comprehensive comparison of the two leading cross-platform mobile development frameworks.',
    content: `Choosing between Flutter and React Native is one of the most common dilemmas for mobile developers. Let's break it down:\n\n**Flutter**\n- Built by Google using Dart\n- Compiles to native ARM code\n- Excellent performance\n- Rich widget library\n- Growing ecosystem\n\n**React Native**\n- Built by Meta using JavaScript/TypeScript\n- Bridges to native components\n- Huge JavaScript ecosystem\n- Easier for web developers\n- Larger community\n\n**My Recommendation**\n\nIf you're already a JavaScript developer: go React Native. If you're starting fresh or want the best performance: go Flutter.\n\nBoth are excellent choices in 2024 with strong corporate backing and active communities.`,
    thumbnail: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800&q=80',
    category: 'Mobile Development',
    authorId: 'inst-2',
    authorName: 'Fatima Malik',
    publishedAt: '2024-05-22',
    isPublished: true,
    readTime: '6 min read',
    tags: ['Flutter', 'React Native', 'Mobile'],
  },
  {
    id: 'blog-3',
    slug: 'getting-started-machine-learning-python',
    title: 'Getting Started with Machine Learning in Python: A Beginner\'s Roadmap',
    excerpt: 'Everything you need to know to start your machine learning journey with Python.',
    content: `Machine learning might seem intimidating at first, but with the right roadmap, anyone can get started.\n\n**Step 1: Master Python Basics**\nYou need solid Python fundamentals: variables, loops, functions, and OOP.\n\n**Step 2: Learn NumPy and Pandas**\nThese are the core data manipulation tools used in every ML project.\n\n**Step 3: Data Visualization**\nLearn Matplotlib and Seaborn to understand your data visually.\n\n**Step 4: Scikit-learn**\nThis is the go-to library for classical ML algorithms. Start here!\n\n**Step 5: Deep Learning**\nOnce you have the fundamentals, explore TensorFlow or PyTorch for neural networks.`,
    thumbnail: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80',
    category: 'Data Science',
    authorId: 'inst-3',
    authorName: 'Bilal Ahmed',
    publishedAt: '2024-06-01',
    isPublished: true,
    readTime: '10 min read',
    tags: ['Python', 'Machine Learning', 'Beginner'],
  },
  {
    id: 'blog-4',
    slug: 'design-principles-every-developer-should-know',
    title: '5 Design Principles Every Developer Should Know',
    excerpt: 'You don\'t need to be a designer to create beautiful interfaces. These 5 principles will change how you build UIs.',
    content: `As a developer, understanding basic design principles will make your applications significantly better.\n\n**1. Visual Hierarchy**\nGuide the user's eye to the most important elements first using size, color, and placement.\n\n**2. Whitespace**\nDon't be afraid of empty space. It makes your UI breathe and helps focus attention.\n\n**3. Consistency**\nUse the same colors, fonts, and patterns throughout. Build a design system.\n\n**4. Contrast**\nEnsure sufficient contrast between text and backgrounds for readability and accessibility.\n\n**5. Alignment**\nAlign elements to create visual order and a professional look.`,
    thumbnail: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800&q=80',
    category: 'Design',
    authorId: 'inst-4',
    authorName: 'Zainab Raza',
    publishedAt: '2024-06-03',
    isPublished: true,
    readTime: '5 min read',
    tags: ['Design', 'UI/UX', 'CSS'],
  },
];

export function getPublishedPosts() {
  return blogPosts.filter(p => p.isPublished);
}

export function getPostBySlug(slug: string) {
  return blogPosts.find(p => p.slug === slug);
}
