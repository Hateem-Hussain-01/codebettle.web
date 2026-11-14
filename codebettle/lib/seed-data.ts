/**
 * Seed rows (Eman's 13 Nov 2026 change, PR #32 follow-up).
 *
 * SINGLE SOURCE OF TRUTH for the seeded team + stories: the Prisma
 * migration (`migrations/app/20261113T17*_team_hierarchy_seed_data`)
 * and the SQL twin (`codebettle-success-stories-mgmt-migration.sql`,
 * run in the Supabase SQL Editor) insert exactly these rows — same
 * fixed ids, same names, same text — with ON CONFLICT DO NOTHING, so
 * re-running the SQL never duplicates them.
 *
 * These are PLACEHOLDER rows so Eman can see the layout — realistic
 * common Pakistani names, as he asked. They are not real people: he
 * will disable/delete them from admin once he has seen the pages.
 * No photos (the cards fall back to initials).
 *
 * - 3 team members, one per hierarchy level, so the About page shows
 *   the Management → Departments → Trainers order.
 * - 5 success stories, approved + enabled, so the Success Stories
 *   page shows the grid exactly like real stories. Story seeding is
 *   NOT held — Eman confirmed 13 Nov ~22:24 PKT to seed them.
 */
import type { TeamMemberLevel } from './db/types';

export interface TeamSeedMember {
  id: string;
  fullName: string;
  designation: string;
  bio: string;
  level: TeamMemberLevel;
  department: string | null;
  sortOrder: number;
}

export const TEAM_SEED_MEMBERS: TeamSeedMember[] = [
  {
    id: 'seed-team-ali-raza',
    fullName: 'Ali Raza',
    designation: 'Managing Director',
    bio: 'Leads CodeBettle and works on growing the institute.',
    level: 'management',
    department: null,
    sortOrder: 0,
  },
  {
    id: 'seed-team-fatima-khan',
    fullName: 'Fatima Khan',
    designation: 'Design Lead',
    bio: 'Leads the design team and helps students build portfolios.',
    level: 'department',
    department: 'Design',
    sortOrder: 1,
  },
  {
    id: 'seed-team-usman-ali',
    fullName: 'Usman Ali',
    designation: 'Python Trainer',
    bio: 'Teaches Python and mentors students on real projects.',
    level: 'trainer',
    department: null,
    sortOrder: 2,
  },
];

export interface StorySeed {
  id: string;
  submissionNumber: string;
  fullName: string;
  email: string;
  courseTitle: string;
  skillsLearned: string;
  experience: string;
  story: string;
  displayOrder: number;
  idempotencyKey: string;
}

export const STORY_SEED_MEMBERS: StorySeed[] = [
  {
    id: 'seed-story-1',
    submissionNumber: 'SS-2026-SEED-1',
    fullName: 'Ayesha Khan',
    email: 'ayesha.khan@example.com',
    courseTitle: 'Python',
    skillsLearned: 'Python, Django',
    experience: 'A practical, hands-on learning experience from start to finish.',
    story:
      'I joined CodeBettle with no coding background. The Python course took me from the basics to building real projects, and I now work as a junior developer.',
    displayOrder: 0,
    idempotencyKey: 'admin-seed-story-1',
  },
  {
    id: 'seed-story-2',
    submissionNumber: 'SS-2026-SEED-2',
    fullName: 'Omar Farooq',
    email: 'omar.farooq@example.com',
    courseTitle: 'Web Development',
    skillsLearned: 'HTML, CSS, JavaScript, React',
    experience: 'Every lesson ended with something I had actually built myself.',
    story:
      'The web development course gave me hands-on practice with real projects. I built my own portfolio website during the course and started freelancing soon after.',
    displayOrder: 1,
    idempotencyKey: 'admin-seed-story-2',
  },
  {
    id: 'seed-story-3',
    submissionNumber: 'SS-2026-SEED-3',
    fullName: 'Sara Ahmed',
    email: 'sara.ahmed@example.com',
    courseTitle: 'Flutter',
    skillsLearned: 'Flutter, Dart, Firebase',
    experience: 'Supportive teachers and a clear path from beginner to app builder.',
    story:
      'I always wanted to build mobile apps. The Flutter course helped me publish my first app, and I now build apps for local businesses.',
    displayOrder: 2,
    idempotencyKey: 'admin-seed-story-3',
  },
  {
    id: 'seed-story-4',
    submissionNumber: 'SS-2026-SEED-4',
    fullName: 'Ahmed Raza',
    email: 'ahmed.raza@example.com',
    courseTitle: 'UI/UX Design',
    skillsLearned: 'Figma, UI/UX, Prototyping',
    experience: 'Learned design by doing real briefs, not just watching videos.',
    story:
      'The UI/UX course changed how I think about design. I learned Figma from scratch and now work on design projects with a small team.',
    displayOrder: 3,
    idempotencyKey: 'admin-seed-story-4',
  },
  {
    id: 'seed-story-5',
    submissionNumber: 'SS-2026-SEED-5',
    fullName: 'Hira Malik',
    email: 'hira.malik@example.com',
    courseTitle: 'Data Science',
    skillsLearned: 'Python, Machine Learning, Pandas',
    experience: 'Complex topics were broken down into steps I could follow.',
    story:
      'Data science felt out of reach until I joined CodeBettle. The step-by-step lessons helped me complete my first machine learning project.',
    displayOrder: 4,
    idempotencyKey: 'admin-seed-story-5',
  },
];
