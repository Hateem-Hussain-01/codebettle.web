import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  DEFAULT_PAGE_STATS,
  DEFAULT_VIDEO_CONFIG,
  compareTeamMembers,
  isTeamMemberLevel,
  moveItem,
  orderValuesAfterMove,
  parsePageStats,
  parseVideoConfig,
  resolveNavItems,
  teamLevelLabel,
  validateNavItem,
  validateStudentReview,
  validateTeamMember,
  visibleCount,
} from '../lib/management';
import { STORY_SEED_MEMBERS, TEAM_SEED_MEMBERS } from '../lib/seed-data';
import {
  createTeamMember,
  deleteTeamMember,
  getTeamMemberById,
  listEnabledTeamMembers,
  listTeamMembers,
  updateTeamMember,
} from '../lib/db/team-members';
import {
  createStudentReview,
  deleteStudentReview,
  getStudentReviewById,
  listEnabledStudentReviews,
  listStudentReviews,
  updateStudentReview,
} from '../lib/db/student-reviews';
import {
  createNavItem,
  deleteNavItem,
  listNavItems,
  seedDefaultNavItems,
  updateNavItem,
} from '../lib/db/nav-items';
import { DEFAULT_SETTINGS } from '../lib/services/settings-service';
import {
  createAdminSuccessStory,
  deleteSuccessStory,
  listPublicSuccessStories,
} from '../lib/services/success-story-service';
import { getSuccessStorySubmissionById, updateSuccessStorySubmission } from '../lib/db/success-stories';
import {
  deleteStudentReviewPhotoImage,
  deleteTeamMemberPhotoImage,
  studentReviewPhotoPathFromUrl,
  teamMemberPhotoPathFromUrl,
} from '../lib/services/course-image-storage';

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
});

test.afterEach(() => {
  __resetDbClient();
});

// ---------------------------------------------------------------------------
// Video config (pure)
// ---------------------------------------------------------------------------

test('video config: defaults when nothing is stored', () => {
  assert.deepEqual(parseVideoConfig(null), DEFAULT_VIDEO_CONFIG);
  assert.deepEqual(parseVideoConfig({}), DEFAULT_VIDEO_CONFIG);
});

test('video config: invalid values fall back to defaults, position is corrected to its layout', () => {
  const parsed = parseVideoConfig({
    videoUrl: 'https://example.com/video.mp4',
    layout: 'side-by-side',
    position: 'video-above',
    orientation: 'bogus',
  });
  assert.equal(parsed.videoUrl, 'https://example.com/video.mp4');
  assert.equal(parsed.layout, 'side-by-side');
  // A side-by-side layout cannot have a vertical position.
  assert.equal(parsed.position, 'video-left');
  assert.equal(parsed.orientation, 'portrait');
  const vertical = parseVideoConfig({ layout: 'vertical', position: 'video-right' });
  assert.equal(vertical.position, 'video-above');
});

test('video config: a valid vertical landscape config survives', () => {
  const parsed = parseVideoConfig({
    layout: 'vertical',
    position: 'video-below',
    orientation: 'landscape',
  });
  assert.deepEqual(parsed, {
    videoUrl: '',
    layout: 'vertical',
    position: 'video-below',
    orientation: 'landscape',
  });
});

// ---------------------------------------------------------------------------
// Stats (pure)
// ---------------------------------------------------------------------------

test('stats: defaults are the home page numbers; blank stored values fall back', () => {
  assert.deepEqual(DEFAULT_PAGE_STATS, {
    activeStudents: '1500+',
    certificatesIssued: '300+',
    averageRating: '4.8',
  });
  assert.deepEqual(parsePageStats({ activeStudents: '  ', averageRating: '5' }), {
    activeStudents: '1500+',
    certificatesIssued: '300+',
    averageRating: '5',
  });
});

// ---------------------------------------------------------------------------
// Team flat order + Load More + reorder (pure)
// ---------------------------------------------------------------------------

test('team sorting: flat sortOrder only — level and department do NOT order the list', () => {
  // A trainer with sortOrder 0 comes before a manager with sortOrder 1:
  // the About page shows one flat list in the admin-set order, no
  // hierarchy grouping (Eman's 14 Nov 2026 change).
  const members = [
    { id: 'm', sortOrder: 1 },
    { id: 't', sortOrder: 0 },
    { id: 'd', sortOrder: 2 },
  ];
  assert.deepEqual([...members].sort(compareTeamMembers).map((m) => m.id), ['t', 'm', 'd']);
  // Ties on sortOrder fall back to id (deterministic first render).
  const tied = [
    { id: 'b', sortOrder: 0 },
    { id: 'a', sortOrder: 0 },
  ];
  assert.deepEqual([...tied].sort(compareTeamMembers).map((m) => m.id), ['a', 'b']);
  // Level label + level guard (level is still stored, just not used for order).
  assert.equal(teamLevelLabel('management'), 'Management');
  assert.equal(teamLevelLabel('department', 'Design'), 'Design');
  assert.equal(teamLevelLabel('department', null), 'Departments');
  assert.equal(teamLevelLabel('trainer'), 'Trainers');
  assert.equal(isTeamMemberLevel('management'), true);
  assert.equal(isTeamMemberLevel('bogus'), false);
  assert.equal(isTeamMemberLevel(1), false);
});

test('load more: first 5, then 5 more per click, never past the total', () => {
  assert.equal(visibleCount(12, 5, 0), 5);
  assert.equal(visibleCount(12, 5, 1), 10);
  assert.equal(visibleCount(12, 5, 2), 12);
  assert.equal(visibleCount(0, 5, 0), 0);
});

test('reorder: up/down moves one step, edges return null', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(moveItem(items, 'b', 'up')?.map((i) => i.id), ['b', 'a', 'c']);
  assert.deepEqual(moveItem(items, 'b', 'down')?.map((i) => i.id), ['a', 'c', 'b']);
  assert.equal(moveItem(items, 'a', 'up'), null);
  assert.equal(moveItem(items, 'c', 'down'), null);
  assert.equal(moveItem(items, 'zzz', 'up'), null);
  assert.deepEqual(orderValuesAfterMove(items, 'b', 'up'), [
    { id: 'b', order: 0 },
    { id: 'a', order: 1 },
    { id: 'c', order: 2 },
  ]);
});

// ---------------------------------------------------------------------------
// Validation (pure)
// ---------------------------------------------------------------------------

test('team validation: name + designation required, level must be named, department needs a name', () => {
  assert.equal(validateTeamMember({ fullName: '', designation: 'CEO' }), 'Full name is required');
  assert.equal(validateTeamMember({ fullName: 'Ahmad', designation: '' }), 'Designation is required');
  assert.equal(
    validateTeamMember({ fullName: 'Ahmad', designation: 'CEO', linkedinUrl: 'not-a-url' }),
    'LinkedIn URL must be a valid http(s) URL',
  );
  assert.equal(
    validateTeamMember({ fullName: 'Ahmad', designation: 'CEO', level: 'bogus' }),
    'Level must be Management, Department or Trainer',
  );
  assert.equal(
    validateTeamMember({ fullName: 'Ahmad', designation: 'Designer', level: 'department', department: '  ' }),
    'Department name is required for department-level members',
  );
  assert.equal(
    validateTeamMember({ fullName: 'Ahmad', designation: 'Designer', level: 'department', department: 'Design' }),
    null,
  );
  assert.equal(validateTeamMember({ fullName: 'Ahmad', designation: 'CEO', level: 'management' }), null);
  assert.equal(validateTeamMember({ fullName: 'Ahmad', designation: 'CEO' }), null);
  assert.equal(
    validateTeamMember({ fullName: 'Ahmad', designation: 'CEO', sortOrder: -1 }),
    'Order must be a whole number of 0 or more',
  );
  assert.equal(validateTeamMember({ fullName: 'Ahmad', designation: 'CEO', sortOrder: 2 }), null);
});

test('review validation: rating 1-5, text required', () => {
  assert.equal(
    validateStudentReview({ fullName: 'Ali', role: 'Student', reviewText: 'Great', rating: 6 }),
    'Rating must be a whole number from 1 to 5',
  );
  assert.equal(
    validateStudentReview({ fullName: 'Ali', role: 'Student', reviewText: '  ' }),
    'Review text is required',
  );
  assert.equal(
    validateStudentReview({ fullName: 'Ali', role: 'Student', reviewText: 'Great', rating: 5 }),
    null,
  );
});

test('nav validation: label required, destination must be a path or http(s) URL', () => {
  assert.equal(validateNavItem({ label: '', href: '/courses' }), 'Label is required');
  assert.equal(validateNavItem({ label: 'X', href: 'notaurl' }), 'Destination must be a site path (starting with /) or a full http(s) URL');
  assert.equal(validateNavItem({ label: 'Spotlight', href: '/success-stories' }), null);
  assert.equal(validateNavItem({ label: 'External', href: 'https://example.com' }), null);
});

// ---------------------------------------------------------------------------
// Nav fallback (pure)
// ---------------------------------------------------------------------------

test('nav fallback: empty DB config renders the hardcoded nav with Spotlight', () => {
  const items = resolveNavItems([]);
  assert.deepEqual(items, [
    { label: 'Courses', href: '/courses' },
    { label: 'Instructors', href: '/instructors' },
    { label: 'Blog', href: '/blog' },
    { label: 'Spotlight', href: '/success-stories' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ]);
  assert.deepEqual(resolveNavItems(null), resolveNavItems([]));
});

test('nav resolve: enabled DB items in order; disabled hidden', () => {
  const items = resolveNavItems([
    { id: '2', label: 'Blog', href: '/blog', order: 1, enabled: true },
    { id: '1', label: 'Courses', href: '/courses', order: 0, enabled: true },
    { id: '3', label: 'Hidden', href: '/hidden', order: 2, enabled: false },
  ]);
  assert.deepEqual(items, [
    { label: 'Courses', href: '/courses' },
    { label: 'Blog', href: '/blog' },
  ]);
});

// ---------------------------------------------------------------------------
// Team members (fake DB)
// ---------------------------------------------------------------------------

test('team: CRUD + enabled visibility (disabled stays in admin, hidden publicly)', async () => {
  const member = await createTeamMember({
    fullName: 'Ahmad Hassan',
    designation: 'Chief Executive Officer',
    bio: 'Founder',
    level: 'management',
    sortOrder: 0,
  });
  assert.equal(member.fullName, 'Ahmad Hassan');
  assert.equal(member.level, 'management');
  assert.equal(member.department, undefined);
  assert.equal(member.enabled, true);
  assert.equal((await listEnabledTeamMembers()).length, 1);
  assert.equal((await listTeamMembers()).length, 1);

  // Department level stores its department; leaving the level clears it.
  const designer = await createTeamMember({
    fullName: 'Sara Designer',
    designation: 'Designer',
    level: 'department',
    department: 'Design',
    sortOrder: 1,
  });
  assert.equal(designer.department, 'Design');
  const moved = await updateTeamMember(designer.id, { level: 'trainer', department: null });
  assert.equal(moved?.level, 'trainer');
  assert.equal(moved?.department, undefined);

  // Admin list is flat sortOrder order (NOT hierarchy: the trainer
  // Sara with sortOrder 1 comes after Ahmad with sortOrder 0).
  assert.deepEqual(
    (await listTeamMembers()).map((m) => m.fullName),
    ['Ahmad Hassan', 'Sara Designer'],
  );

  // The admin arrows swap sortOrder between two adjacent members
  // (the whole flat list, not just within a level) — the public
  // About page order flips with it.
  await updateTeamMember(member.id, { sortOrder: 1 });
  await updateTeamMember(designer.id, { sortOrder: 0 });
  assert.deepEqual(
    (await listTeamMembers()).map((m) => m.fullName),
    ['Sara Designer', 'Ahmad Hassan'],
  );
  assert.deepEqual(
    (await listEnabledTeamMembers()).map((m) => m.fullName),
    ['Sara Designer', 'Ahmad Hassan'],
  );

  const updated = await updateTeamMember(member.id, { enabled: false });
  assert.equal(updated?.enabled, false);
  assert.equal((await listEnabledTeamMembers()).length, 1);
  // Still in the admin list.
  assert.equal((await listTeamMembers()).length, 2);
  assert.equal((await getTeamMemberById(member.id))?.fullName, 'Ahmad Hassan');

  // REAL DELETE: the row is gone, not just hidden.
  assert.equal(await deleteTeamMember(member.id), true);
  assert.equal(await getTeamMemberById(member.id), null);
  assert.equal((await listTeamMembers()).length, 1);
  assert.equal(await deleteTeamMember(member.id), false);

  assert.equal(await deleteTeamMember(designer.id), true);
  assert.equal(await getTeamMemberById(designer.id), null);
  assert.equal((await listTeamMembers()).length, 0);
});

// ---------------------------------------------------------------------------
// Student reviews (fake DB)
// ---------------------------------------------------------------------------

test('reviews: CRUD + enabled visibility (disabled stays in admin, hidden from the carousel)', async () => {
  const review = await createStudentReview({
    fullName: 'Ali Raza',
    role: 'Python Student',
    rating: 5,
    reviewText: 'Great course.',
    order: 0,
  });
  assert.equal(review.enabled, true);
  assert.equal((await listEnabledStudentReviews()).length, 1);

  await updateStudentReview(review.id, { enabled: false });
  assert.equal((await listEnabledStudentReviews()).length, 0);
  assert.equal((await listStudentReviews()).length, 1);

  await updateStudentReview(review.id, { enabled: true, rating: 4 });
  const enabled = await listEnabledStudentReviews();
  assert.equal(enabled.length, 1);
  assert.equal(enabled[0].rating, 4);

  assert.equal(await deleteStudentReview(review.id), true);
  assert.equal(await getStudentReviewById(review.id), null);
  assert.equal((await listStudentReviews()).length, 0);
  assert.equal(await deleteStudentReview(review.id), false);
});

// ---------------------------------------------------------------------------
// Nav items (fake DB)
// ---------------------------------------------------------------------------

test('nav items: CRUD + seed defaults is idempotent and uses Spotlight', async () => {
  const seeded = await seedDefaultNavItems();
  assert.equal(seeded.length, 6);
  assert.equal(seeded.find((i) => i.href === '/success-stories')?.label, 'Spotlight');
  assert.deepEqual(
    seeded.map((i) => i.order),
    [0, 1, 2, 3, 4, 5],
  );

  // A second seed does not duplicate.
  const reseeded = await seedDefaultNavItems();
  assert.equal(reseeded.length, 6);
  assert.equal((await listNavItems()).length, 6);

  const custom = await createNavItem({ label: 'Custom', href: '/custom', order: 6 });
  assert.equal(custom.enabled, true);
  await updateNavItem(custom.id, { enabled: false, label: 'Custom Renamed' });
  const items = await listNavItems();
  assert.equal(items.find((i) => i.id === custom.id)?.label, 'Custom Renamed');
  assert.equal(await deleteNavItem(custom.id), true);
  assert.equal((await listNavItems()).length, 6);
});

// ---------------------------------------------------------------------------
// Admin-created stories + story visibility (fake DB)
// ---------------------------------------------------------------------------

test('admin-created story: published immediately, hidden when disabled', async () => {
  const story = await createAdminSuccessStory({
    fullName: 'Sara Khan',
    email: 'sara@example.com',
    country: 'Pakistan',
    courseTitle: 'Python',
    skillsLearned: 'Python, Django',
    experience: 'Great experience.',
    story: 'My journey.',
  });
  assert.equal(story.status, 'approved');
  assert.equal(story.adminCreated, true);
  assert.equal(story.enabled, true);

  const publicStories = await listPublicSuccessStories();
  assert.equal(publicStories.length, 1);
  assert.equal(publicStories[0].fullName, 'Sara Khan');

  await updateSuccessStorySubmission(story.id, { enabled: false });
  assert.equal((await listPublicSuccessStories()).length, 0);

  await updateSuccessStorySubmission(story.id, { enabled: true, displayOrder: 2 });
  assert.equal((await listPublicSuccessStories()).length, 1);
});

// ---------------------------------------------------------------------------
// Settings defaults (PR #32)
// ---------------------------------------------------------------------------

test('settings defaults: no video yet, home page stats, navbar logo URL', () => {
  assert.equal(DEFAULT_SETTINGS.videoUrl, '');
  assert.equal(DEFAULT_SETTINGS.videoLayout, 'side-by-side');
  assert.equal(DEFAULT_SETTINGS.videoPosition, 'video-left');
  assert.equal(DEFAULT_SETTINGS.videoOrientation, 'portrait');
  assert.equal(DEFAULT_SETTINGS.statsActiveStudents, '1500+');
  assert.equal(DEFAULT_SETTINGS.statsCertificatesIssued, '300+');
  assert.equal(DEFAULT_SETTINGS.statsAverageRating, '4.8');
  assert.equal(
    DEFAULT_SETTINGS.navbarLogoUrl,
    'https://phuzoxshzdfzjvephlhq.supabase.co/storage/v1/object/public/course-images/brand/navbar-logo.png',
  );
});

// ---------------------------------------------------------------------------
// Seed data (lib/seed-data.ts — same rows as the migration + SQL twin)
// ---------------------------------------------------------------------------

test('seed data: exact placeholder names, one team member per level, no placeholder word', () => {
  assert.deepEqual(
    TEAM_SEED_MEMBERS.map((m) => [m.fullName, m.designation, m.level, m.department]),
    [
      ['Ali Raza', 'Managing Director', 'management', null],
      ['Fatima Khan', 'Design Lead', 'department', 'Design'],
      ['Usman Ali', 'Python Trainer', 'trainer', null],
    ],
  );
  assert.deepEqual(
    STORY_SEED_MEMBERS.map((s) => s.fullName),
    ['Ayesha Khan', 'Omar Farooq', 'Sara Ahmed', 'Ahmed Raza', 'Hira Malik'],
  );
  assert.equal(STORY_SEED_MEMBERS.length, 5);
  // No 'Demo' word anywhere in the seeded data.
  const blob = JSON.stringify([...TEAM_SEED_MEMBERS, ...STORY_SEED_MEMBERS]).toLowerCase();
  assert.equal(blob.includes('demo'), false);
  // Every seeded story has a real story text and an approved status to show.
  for (const s of STORY_SEED_MEMBERS) {
    assert.ok(s.story.length > 40, s.fullName);
    assert.ok(!s.story.toLowerCase().includes('demo'), s.fullName);
  }
});

test('seeded team: fixed ids land in the DB and the About page shows them flat in seed sortOrder', async () => {
  const now = new Date();
  fake.seed(
    'TeamMember',
    TEAM_SEED_MEMBERS.map((m) => ({ ...m, photoUrl: null, enabled: true, createdAt: now, updatedAt: now })),
  );
  // Flat list, admin-set order (sortOrder 0, 1, 2) — no grouping.
  assert.deepEqual(
    (await listEnabledTeamMembers()).map((m) => m.fullName),
    ['Ali Raza', 'Fatima Khan', 'Usman Ali'],
  );
  // The seeded rows are disable-able and delete-able from admin.
  await updateTeamMember('seed-team-ali-raza', { enabled: false });
  assert.equal((await listEnabledTeamMembers()).length, 2);
  assert.equal(await deleteTeamMember('seed-team-ali-raza'), true);
  assert.equal(await getTeamMemberById('seed-team-ali-raza'), null);
});

test('seeded stories: approved + enabled, so the public page shows all five in order', async () => {
  // The seeded rows carry displayOrder 0-4 (see lib/seed-data.ts);
  // createAdminSuccessStory defaults it to 0, so set it like the seed.
  const created = [];
  for (const s of STORY_SEED_MEMBERS) {
    created.push(
      await createAdminSuccessStory({
        fullName: s.fullName,
        email: s.email,
        country: 'Pakistan',
        courseTitle: s.courseTitle,
        skillsLearned: s.skillsLearned,
        experience: s.experience,
        story: s.story,
      }),
    );
  }
  for (let i = 0; i < created.length; i++) {
    await updateSuccessStorySubmission(created[i].id, { displayOrder: i });
  }
  const publicStories = await listPublicSuccessStories();
  assert.equal(publicStories.length, 5);
  assert.deepEqual(
    publicStories.map((s) => s.fullName),
    ['Ayesha Khan', 'Omar Farooq', 'Sara Ahmed', 'Ahmed Raza', 'Hira Malik'],
  );
  // Five stories fill the first Load More page exactly.
  assert.equal(visibleCount(publicStories.length, 5, 0), 5);
});

// ---------------------------------------------------------------------------
// Real delete — stories (row gone, not just hidden)
// ---------------------------------------------------------------------------

test('story delete is a real DB delete: row gone, public list empty', async () => {
  const story = await createAdminSuccessStory({
    fullName: 'Sara Khan',
    email: 'sara@example.com',
    country: 'Pakistan',
    courseTitle: 'Python',
    skillsLearned: 'Python, Django',
    experience: 'Great experience.',
    story: 'My journey.',
  });
  assert.equal((await listPublicSuccessStories()).length, 1);
  assert.equal(await deleteSuccessStory(story.id), true);
  assert.equal(await getSuccessStorySubmissionById(story.id), null);
  assert.equal((await listPublicSuccessStories()).length, 0);
  assert.equal(await deleteSuccessStory(story.id), false);
});

// ---------------------------------------------------------------------------
// Photo file delete (mock storage client — same pattern as
// tests/course-thumbnail.test.ts)
// ---------------------------------------------------------------------------

function mockStorageClient(): SupabaseClient & { __calls: { bucket: string; path?: string }[] } {
  const calls: { bucket: string; path?: string }[] = [];
  const client = {
    __calls: calls,
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          calls.push({ bucket, path: paths[0] });
          return { data: [], error: null };
        },
      }),
    },
  };
  return client as unknown as SupabaseClient & { __calls: { bucket: string; path?: string }[] };
}

test('photo delete: path helpers resolve only their own prefix; delete removes by path', async () => {
  const base = 'https://example.supabase.co/storage/v1/object/public/course-images/';
  assert.equal(teamMemberPhotoPathFromUrl(`${base}team/members/abc.jpg`), 'team/members/abc.jpg');
  assert.equal(teamMemberPhotoPathFromUrl(`${base}courses/x.jpg`), null);
  assert.equal(teamMemberPhotoPathFromUrl('https://images.unsplash.com/x.jpg'), null);
  assert.equal(studentReviewPhotoPathFromUrl(`${base}reviews/def.png`), 'reviews/def.png');
  assert.equal(studentReviewPhotoPathFromUrl(`${base}team/members/abc.jpg`), null);
  assert.equal(studentReviewPhotoPathFromUrl('https://example.com/t.png'), null);

  const client = mockStorageClient();
  await deleteTeamMemberPhotoImage('team/members/abc.jpg', client);
  await deleteStudentReviewPhotoImage('reviews/def.png', client);
  assert.deepEqual(client.__calls, [
    { bucket: 'course-images', path: 'team/members/abc.jpg' },
    { bucket: 'course-images', path: 'reviews/def.png' },
  ]);
});
