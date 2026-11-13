#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/890e963fcb2b37f0e9b69c2ea3701646c87a59f5ff6f05d1362daf00fa9214df/contract';
import startContract from '../../snapshots/890e963fcb2b37f0e9b69c2ea3701646c87a59f5ff6f05d1362daf00fa9214df/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d34358cf5bd579183fc13b0a5b0f47beacaf9f97a39905517fcabf05db278e56/contract';
import endContract from '../../snapshots/d34358cf5bd579183fc13b0a5b0f47beacaf9f97a39905517fcabf05db278e56/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, rawSql, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'TeamMember',
        column: col('department', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      // Old int levels (PR #32, unmerged) map to the new string
      // levels: 1 = Management, 2 = Department, 3 = Trainer; any
      // other value becomes 'department'. The table is brand new
      // (PR #32 not merged yet), so this normally converts zero rows.
      this.alterColumnType({
        schema: 'public',
        table: 'TeamMember',
        column: 'level',
        type: 'text',
        using: sql`CASE "level" WHEN 1 THEN 'management' WHEN 2 THEN 'department' WHEN 3 THEN 'trainer' ELSE 'department' END`,
        operationClass: 'data',
      }),
      this.setDefault({
        schema: 'public',
        table: 'TeamMember',
        column: col('level', 'text', {
          default: lit('management'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      // Seeded team members (Eman's 13 Nov 2026 change): placeholder
      // rows so he can see the layout — realistic common Pakistani
      // names, one per hierarchy level, no photos (initials fallback).
      // He will disable/delete them from admin. Fixed ids + ON
      // CONFLICT DO NOTHING, so re-running the migration never
      // duplicates them. Same rows as lib/seed-data.ts and the SQL
      // twin. Postchecks skip this op once all three rows exist; a
      // partial state still fills in the missing rows.
      rawSql({
        id: 'data.public.TeamMember.seed-team',
        label: 'Seed placeholder team members',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: { schema: 'public', objectType: 'table', name: 'TeamMember' },
        },
        precheck: [],
        execute: [
          {
            description: 'Insert placeholder team members',
            sql: `INSERT INTO "public"."TeamMember" ("id", "photoUrl", "fullName", "designation", "bio", "level", "department", "orderInLevel", "enabled", "createdAt", "updatedAt")
VALUES
  ('seed-team-ali-raza', NULL, 'Ali Raza', 'Managing Director', 'Leads CodeBettle and works on growing the institute.', 'management', NULL, 0, true, now(), now()),
  ('seed-team-fatima-khan', NULL, 'Fatima Khan', 'Design Lead', 'Leads the design team and helps students build portfolios.', 'department', 'Design', 0, true, now(), now()),
  ('seed-team-usman-ali', NULL, 'Usman Ali', 'Python Trainer', 'Teaches Python and mentors students on real projects.', 'trainer', NULL, 0, true, now(), now())
ON CONFLICT ("id") DO NOTHING;`,
          },
        ],
        postcheck: ['seed-team-ali-raza', 'seed-team-fatima-khan', 'seed-team-usman-ali'].map((id) => ({
          description: `verify seeded team member ${id} exists`,
          sql: 'SELECT EXISTS (SELECT 1 AS "one" FROM "public"."TeamMember" AS "t" WHERE ("t"."id" = $1)) AS "result"',
          params: [id],
          expectation: { expects: 'present', object: `seeded team member ${id}` },
        })),
      }),
      // Seeded success stories (Eman's 13 Nov 2026 change): approved +
      // enabled placeholder stories, so the Success Stories page shows
      // the grid exactly like real stories. Same idempotency as the
      // team seeds, same rows as lib/seed-data.ts and the SQL twin.
      rawSql({
        id: 'data.public.SuccessStorySubmission.seed-stories',
        label: 'Seed placeholder success stories',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: { schema: 'public', objectType: 'table', name: 'SuccessStorySubmission' },
        },
        precheck: [],
        execute: [
          {
            description: 'Insert placeholder success stories',
            sql: `INSERT INTO "public"."SuccessStorySubmission" ("id", "submissionNumber", "fullName", "email", "country", "courseTitle", "skillsLearned", "experience", "story", "consentPublication", "consentMedia", "consentAccuracy", "consentContact", "status", "featured", "adminCreated", "enabled", "displayOrder", "adminNote", "idempotencyKey", "submittedAt", "updatedAt")
VALUES
  ('seed-story-1', 'SS-2026-SEED-1', 'Ayesha Khan', 'ayesha.khan@example.com', 'Pakistan', 'Python', 'Python, Django', 'A practical, hands-on learning experience from start to finish.', 'I joined CodeBettle with no coding background. The Python course took me from the basics to building real projects, and I now work as a junior developer.', true, true, true, false, 'approved', false, true, true, 0, 'Seeded placeholder — delete from admin.', 'admin-seed-story-1', now(), now()),
  ('seed-story-2', 'SS-2026-SEED-2', 'Omar Farooq', 'omar.farooq@example.com', 'Pakistan', 'Web Development', 'HTML, CSS, JavaScript, React', 'Every lesson ended with something I had actually built myself.', 'The web development course gave me hands-on practice with real projects. I built my own portfolio website during the course and started freelancing soon after.', true, true, true, false, 'approved', false, true, true, 1, 'Seeded placeholder — delete from admin.', 'admin-seed-story-2', now(), now()),
  ('seed-story-3', 'SS-2026-SEED-3', 'Sara Ahmed', 'sara.ahmed@example.com', 'Pakistan', 'Flutter', 'Flutter, Dart, Firebase', 'Supportive teachers and a clear path from beginner to app builder.', 'I always wanted to build mobile apps. The Flutter course helped me publish my first app, and I now build apps for local businesses.', true, true, true, false, 'approved', false, true, true, 2, 'Seeded placeholder — delete from admin.', 'admin-seed-story-3', now(), now()),
  ('seed-story-4', 'SS-2026-SEED-4', 'Ahmed Raza', 'ahmed.raza@example.com', 'Pakistan', 'UI/UX Design', 'Figma, UI/UX, Prototyping', 'Learned design by doing real briefs, not just watching videos.', 'The UI/UX course changed how I think about design. I learned Figma from scratch and now work on design projects with a small team.', true, true, true, false, 'approved', false, true, true, 3, 'Seeded placeholder — delete from admin.', 'admin-seed-story-4', now(), now()),
  ('seed-story-5', 'SS-2026-SEED-5', 'Hira Malik', 'hira.malik@example.com', 'Pakistan', 'Data Science', 'Python, Machine Learning, Pandas', 'Complex topics were broken down into steps I could follow.', 'Data science felt out of reach until I joined CodeBettle. The step-by-step lessons helped me complete my first machine learning project.', true, true, true, false, 'approved', false, true, true, 4, 'Seeded placeholder — delete from admin.', 'admin-seed-story-5', now(), now())
ON CONFLICT ("id") DO NOTHING;`,
          },
        ],
        postcheck: ['seed-story-1', 'seed-story-2', 'seed-story-3', 'seed-story-4', 'seed-story-5'].map((id) => ({
          description: `verify seeded success story ${id} exists`,
          sql: 'SELECT EXISTS (SELECT 1 AS "one" FROM "public"."SuccessStorySubmission" AS "s" WHERE ("s"."id" = $1)) AS "result"',
          params: [id],
          expectation: { expects: 'present', object: `seeded success story ${id}` },
        })),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
